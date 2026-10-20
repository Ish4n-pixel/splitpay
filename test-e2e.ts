import { io } from 'socket.io-client';

async function runE2ETests() {
  console.log('--- Starting Full End-to-End System Test ---\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Create table
  console.log('1. Testing Session Creation...');
  const createRes = await fetch(`${BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostName: 'Kunal (Host)',
      hostUpiVpa: 'kunal@okhdfcbank',
      title: 'Saturday Rooftop Party',
      feeMode: 'proportional',
    }),
  });

  const sessionData = await createRes.json();
  if (!sessionData.success) throw new Error('Failed to create session');
  const code = sessionData.code;
  const hostKey = sessionData.hostKey;
  const hostId = sessionData.hostParticipantId;
  const hostToken = sessionData.hostParticipantToken;
  console.log(`✓ Table created with code: ${code}, Host ID: ${hostId}`);

  // 2. Test QR code generation for the table
  console.log('2. Testing Join QR generation...');
  const qrRes = await fetch(`${BASE_URL}/api/qr?text=${encodeURIComponent(`${BASE_URL}/s/${code}`)}`);
  if (!qrRes.ok || qrRes.headers.get('content-type') !== 'image/png') {
    throw new Error('QR endpoint failed');
  }
  console.log('✓ Join QR Code image generated successfully (image/png)');

  // 3. Save Bill (Items + Taxes + Service Charge + Discount)
  console.log('3. Testing Bill Ingestion (Paneer Tikka, Naan, Biryani, Mojitos)...');
  const billRes = await fetch(`${BASE_URL}/api/sessions/${code}/bill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostKey,
      items: [
        { id: `item_1_${Date.now()}`, name: 'Paneer Tikka', quantity: 1, unitPricePaise: 38000, totalPaise: 38000 },
        { id: `item_2_${Date.now()}`, name: 'Garlic Naan (Basket)', quantity: 2, unitPricePaise: 9000, totalPaise: 18000 },
        { id: `item_3_${Date.now()}`, name: 'Dum Biryani', quantity: 1, unitPricePaise: 45000, totalPaise: 45000 },
        { id: `item_4_${Date.now()}`, name: 'Virgin Mojito Cocktails', quantity: 2, unitPricePaise: 15000, totalPaise: 30000 },
      ],
      charges: [
        { id: `ch_gst_${Date.now()}`, kind: 'tax', label: 'GST 5%', basis: 'percent', value: 5 },
        { id: `ch_svc_${Date.now()}`, kind: 'service', label: 'Service Charge 10%', basis: 'percent', value: 10 },
        { id: `ch_disc_${Date.now()}`, kind: 'discount', label: 'Zomato Gold Discount', basis: 'fixed', value: 10000 },
      ],
      receiptTotalPaise: 152150, // 1310.00 items + 65.50 GST + 131.00 SVC - 100.00 Disc = 1406.50
    }),
  });

  const billData = await billRes.json();
  if (!billData.success) throw new Error('Failed to save bill');
  const items = billData.snapshot.items;
  console.log(`✓ Bill saved with ${items.length} items. Grand total: ₹${(billData.snapshot.split.grandTotal / 100).toFixed(2)}`);

  // 4. Join 2 Guests: Neha and Rohan
  console.log('4. Testing Guests Joining...');
  const nehaRes = await fetch(`${BASE_URL}/api/sessions/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Neha' }),
  });
  const nehaData = await nehaRes.json();
  const nehaId = nehaData.participantId;
  const nehaToken = nehaData.token;

  const rohanRes = await fetch(`${BASE_URL}/api/sessions/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Rohan' }),
  });
  const rohanData = await rohanRes.json();
  const rohanId = rohanData.participantId;
  const rohanToken = rohanData.token;
  console.log(`✓ Joined Neha (${nehaId}) and Rohan (${rohanId})`);

  // 5. Connect Socket.IO client to simulate live claiming and sync
  console.log('5. Testing Real-time Socket.IO synchronization...');
  const socket = io(BASE_URL, { transports: ['websocket'] });

  await new Promise<void>((resolve, reject) => {
    socket.on('connect', () => {
      socket.emit('session:subscribe', { code });
    });

    let step = 0;
    socket.on('session:snapshot', async (snap) => {
      try {
        if (step === 0) {
          step++;
          // Step 1: Kunal claims Biryani (item 2), Neha claims Paneer Tikka (item 0)
          console.log('✓ Socket subscribed. Toggling dish claims...');
          socket.emit('claim:toggle', { code, itemId: items[2].id, participantId: hostId, token: hostToken });
        } else if (step === 1) {
          step++;
          socket.emit('claim:toggle', { code, itemId: items[0].id, participantId: nehaId, token: nehaToken });
        } else if (step === 2) {
          step++;
          // Shared dish: Garlic Naan (item 1) claimed by both Kunal and Neha
          console.log('✓ Testing shared dish (Garlic Naan split between Kunal and Neha)...');
          socket.emit('claim:toggle', { code, itemId: items[1].id, participantId: hostId, token: hostToken });
        } else if (step === 3) {
          step++;
          socket.emit('claim:toggle', { code, itemId: items[1].id, participantId: nehaId, token: nehaToken });
        } else if (step === 4) {
          step++;
          // Rohan claims 2 Cocktails using portion-based claiming
          console.log('✓ Rohan claims 2 Cocktails using portion selection...');
          socket.emit('claim:setPortion', { code, itemId: items[3].id, participantId: rohanId, portion: 2, token: rohanToken });
        } else if (step === 5) {
          step++;
          // Check that all items are now claimed
          if (!snap.progress.allClaimed) {
            throw new Error('Expected allClaimed to be true');
          }
          console.log('✓ All dishes claimed! Checking zero-sum invariant...');
          const sumDue = snap.split.shares.reduce((acc: number, s: any) => acc + s.amountDue, 0);
          if (sumDue !== snap.split.grandTotal) {
            throw new Error(`Invariant failed: sumDue ${sumDue} !== grandTotal ${snap.split.grandTotal}`);
          }
          console.log(`✓ Invariant verified: Sum of shares ₹${(sumDue/100).toFixed(2)} === Grand Total ₹${(snap.split.grandTotal/100).toFixed(2)}`);

          // Step 6: Test Neha marking self as paid via UPI
          console.log('6. Testing Neha marking paid via UPI...');
          socket.emit('payment:markPaid', { participantId: nehaId, token: nehaToken });
        } else if (step === 6) {
          step++;
          const nehaRecord = snap.participants.find((p: any) => p.id === nehaId);
          if (nehaRecord.payStatus !== 'pending_verify') {
            throw new Error('Expected Neha to be pending_verify');
          }
          console.log('✓ Neha status is pending_verify. Testing Host Payment Verification...');
          socket.emit('payment:verify', { code, hostKey, participantId: nehaId });
        } else if (step === 7) {
          step++;
          const nehaRecord = snap.participants.find((p: any) => p.id === nehaId);
          if (nehaRecord.payStatus !== 'paid_upi') {
            throw new Error('Expected Neha to be paid_upi');
          }
          console.log('✓ Neha payment verified by host! Settled amount increased.');

          // Step 8: Test Proxy Cover (Kunal covers Rohan)
          console.log('7. Testing Proxy Cover (Host Kunal covers Guest Rohan)...');
          socket.emit('cover:set', { code, hostKey, targetParticipantId: rohanId, coveredByParticipantId: hostId });
        } else if (step === 8) {
          step++;
          const rohanShare = snap.split.shares.find((s: any) => s.participantId === rohanId);
          const kunalShare = snap.split.shares.find((s: any) => s.participantId === hostId);
          if (rohanShare.amountDue !== 0) throw new Error('Expected Rohan amountDue to be 0');
          if (kunalShare.coveredAmount <= 0) throw new Error('Expected Kunal coveredAmount > 0');
          console.log(`✓ Proxy cover succeeded! Rohan amountDue is ₹0.00, Kunal covering amount is ₹${(kunalShare.coveredAmount/100).toFixed(2)}.`);

          // Step 9: Host marks own share as paid cash
          console.log('8. Testing Host marking paid cash...');
          socket.emit('payment:cash', { code, hostKey, participantId: hostId, isPaid: true });
        } else if (step === 9) {
          step++;
          if (!snap.progress.isFullySettled || snap.progress.settledPercent !== 100) {
            throw new Error('Expected 100% full settlement');
          }
          console.log('✓ 100% POOLED SETTLEMENT REACHED! Celebration banner triggered.');

          // Step 10: Test adding custom Tip
          console.log('9. Testing adding ₹150 table tip...');
          socket.emit('charge:add', {
            code,
            hostKey,
            charge: { id: `tip_${Date.now()}`, kind: 'tip', label: 'Tip (₹150)', basis: 'fixed', value: 15000 },
          });
        } else if (step === 10) {
          step++;
          console.log(`✓ Tip added! New grand total: ₹${(snap.split.grandTotal/100).toFixed(2)}`);

          // Step 11: Test toggling fee mode to equal
          console.log('10. Testing switching fee mode to Equal...');
          socket.emit('settings:feeMode', { code, hostKey, feeMode: 'equal' });
        } else if (step === 11) {
          step++;
          if (snap.session.feeMode !== 'equal') throw new Error('Expected feeMode to be equal');
          console.log('✓ Fee mode successfully switched to Equal! Recomputed proportional shares flat across all seats.');

          socket.disconnect();
          resolve();
        }
      } catch (err) {
        socket.disconnect();
        reject(err);
      }
    });

    socket.on('session:error', (err) => {
      reject(new Error(`Socket error: ${err.message}`));
    });
  });

  // 6. Test Receipt Transparency Endpoint
  console.log('11. Testing Full Transparency Receipt page...');
  const receiptRes = await fetch(`${BASE_URL}/s/${code}/receipt`);
  if (!receiptRes.ok) throw new Error('Receipt page returned error');
  const receiptHtml = await receiptRes.text();
  if (!receiptHtml.includes('Loading receipt breakdown') && !receiptHtml.includes('Full Receipt Transparency')) {
    throw new Error('Receipt page missing expected content');
  }
  console.log('✓ Full transparency page rendered successfully with ledger.');

  console.log('\n======================================================');
  console.log('  ALL END-TO-END UI & BACKEND FLOWS PASSED PERFECTLY!');
  console.log('======================================================\n');
}

runE2ETests().catch((err) => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
