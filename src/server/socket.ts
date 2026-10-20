import { Server as SocketIOServer, Socket } from 'socket.io';
import { repo } from '../lib/db/repo';
import { buildSessionSnapshot } from '../lib/session/snapshot';
import { sessionService } from '../lib/session/service';

export function setupSocketServer(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    let currentSessionCode: string | null = null;

    // Client subscribes to a session room
    socket.on('session:subscribe', (payload: { code: string }) => {
      const { code } = payload;
      if (!code) return;

      const upperCode = code.toUpperCase();
      const session = repo.getSessionByCode(upperCode);
      if (!session) {
        socket.emit('session:error', { message: 'Session not found' });
        return;
      }

      currentSessionCode = upperCode;
      socket.join(`session:${upperCode}`);

      const snapshot = buildSessionSnapshot(session);
      socket.emit('session:snapshot', snapshot);
    });

    // Toggle claiming an item
    socket.on('claim:toggle', (payload: { code: string; itemId: string; participantId: string; token?: string; hostKey?: string; portion?: number }) => {
      try {
        const { code, itemId, participantId, token, hostKey, portion } = payload;
        const upperCode = code.toUpperCase();
        const session = repo.getSessionByCode(upperCode);
        if (!session) return;

        const snapshot = sessionService.toggleClaim(session.id, itemId, participantId, token, hostKey, portion);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Set specific portion for an item (e.g. 1 out of 3, 2 out of 3, 0 to unclaim)
    socket.on('claim:setPortion', (payload: { code: string; itemId: string; participantId: string; portion: number; token?: string; hostKey?: string }) => {
      try {
        const { code, itemId, participantId, portion, token, hostKey } = payload;
        const upperCode = code.toUpperCase();
        const session = repo.getSessionByCode(upperCode);
        if (!session) return;

        const snapshot = sessionService.setClaimPortion(session.id, itemId, participantId, portion, token, hostKey);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Guest marks self as paid (pending host verification)
    socket.on('payment:markPaid', (payload: { participantId: string; token?: string }) => {
      try {
        const { participantId, token } = payload;
        const snapshot = sessionService.markPaid(participantId, token);
        io.to(`session:${snapshot.session.code}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host verifies payment
    socket.on('payment:verify', (payload: { code: string; hostKey: string; participantId: string }) => {
      try {
        const { code, hostKey, participantId } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.verifyPayment(upperCode, hostKey, participantId);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host rejects payment
    socket.on('payment:reject', (payload: { code: string; hostKey: string; participantId: string }) => {
      try {
        const { code, hostKey, participantId } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.rejectPayment(upperCode, hostKey, participantId);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host toggles cash payment
    socket.on('payment:cash', (payload: { code: string; hostKey: string; participantId: string; isPaid: boolean }) => {
      try {
        const { code, hostKey, participantId, isPaid } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.toggleCashPayment(upperCode, hostKey, participantId, isPaid);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host sets proxy cover (diner A covers diner B)
    socket.on('cover:set', (payload: { code: string; hostKey: string; targetParticipantId: string; coveredByParticipantId: string | null }) => {
      try {
        const { code, hostKey, targetParticipantId, coveredByParticipantId } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.setProxyCover(upperCode, hostKey, targetParticipantId, coveredByParticipantId);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host toggles proportional vs equal fee mode
    socket.on('settings:feeMode', (payload: { code: string; hostKey: string; feeMode: 'proportional' | 'equal' }) => {
      try {
        const { code, hostKey, feeMode } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.updateFeeMode(upperCode, hostKey, feeMode);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host adds tip or custom charge
    socket.on('charge:add', (payload: { code: string; hostKey: string; charge: any }) => {
      try {
        const { code, hostKey, charge } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.addCharge(upperCode, hostKey, charge);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host deletes charge
    socket.on('charge:delete', (payload: { code: string; hostKey: string; chargeId: string }) => {
      try {
        const { code, hostKey, chargeId } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.deleteCharge(upperCode, hostKey, chargeId);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host updates/adds item
    socket.on('item:upsert', (payload: { code: string; hostKey: string; item: any }) => {
      try {
        const { code, hostKey, item } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.upsertItem(upperCode, hostKey, item);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    // Host deletes item
    socket.on('item:delete', (payload: { code: string; hostKey: string; itemId: string }) => {
      try {
        const { code, hostKey, itemId } = payload;
        const upperCode = code.toUpperCase();
        const snapshot = sessionService.deleteItem(upperCode, hostKey, itemId);
        io.to(`session:${upperCode}`).emit('session:snapshot', snapshot);
      } catch (err: any) {
        socket.emit('session:error', { message: err.message });
      }
    });

    socket.on('disconnect', () => {
      if (currentSessionCode) {
        socket.leave(`session:${currentSessionCode}`);
      }
    });
  });
}
