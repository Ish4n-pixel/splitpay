'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SessionSnapshot } from './session/snapshot';
import { FeeMode, ChargeKind, ChargeBasis } from './split/engine';

export function useSessionSocket(code: string | null) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!code) return;

    const upperCode = code.toUpperCase();
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      socket.emit('session:subscribe', { code: upperCode });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('session:snapshot', (newSnapshot: SessionSnapshot) => {
      setSnapshot(newSnapshot);
    });

    socket.on('session:error', (err: { message: string }) => {
      setError(err.message);
    });

    // Also fetch initial snapshot via REST as an immediate fallback
    fetch(`/api/sessions/${upperCode}/snapshot`)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Session not found');
      })
      .then((data) => {
        setSnapshot((prev) => prev || data);
      })
      .catch((err) => {
        setError(err.message);
      });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [code]);

  const toggleClaim = useCallback(
    (itemId: string, participantId: string, token?: string, hostKey?: string, portion?: number) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('claim:toggle', { code, itemId, participantId, token, hostKey, portion });
    },
    [code]
  );

  const setClaimPortion = useCallback(
    (itemId: string, participantId: string, portion: number, token?: string, hostKey?: string) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('claim:setPortion', { code, itemId, participantId, portion, token, hostKey });
    },
    [code]
  );

  const markPaid = useCallback(
    (participantId: string, token?: string) => {
      if (!socketRef.current) return;
      socketRef.current.emit('payment:markPaid', { participantId, token });
    },
    []
  );

  const verifyPayment = useCallback(
    (hostKey: string, participantId: string) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('payment:verify', { code, hostKey, participantId });
    },
    [code]
  );

  const rejectPayment = useCallback(
    (hostKey: string, participantId: string) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('payment:reject', { code, hostKey, participantId });
    },
    [code]
  );

  const toggleCashPayment = useCallback(
    (hostKey: string, participantId: string, isPaid: boolean) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('payment:cash', { code, hostKey, participantId, isPaid });
    },
    [code]
  );

  const setProxyCover = useCallback(
    (hostKey: string, targetParticipantId: string, coveredByParticipantId: string | null) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('cover:set', { code, hostKey, targetParticipantId, coveredByParticipantId });
    },
    [code]
  );

  const setFeeMode = useCallback(
    (hostKey: string, feeMode: FeeMode) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('settings:feeMode', { code, hostKey, feeMode });
    },
    [code]
  );

  const addCharge = useCallback(
    (hostKey: string, charge: { id?: string; kind: ChargeKind; label: string; basis: ChargeBasis; value: number }) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('charge:add', { code, hostKey, charge: { id: charge.id || `ch_${Date.now()}`, ...charge } });
    },
    [code]
  );

  const deleteCharge = useCallback(
    (hostKey: string, chargeId: string) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('charge:delete', { code, hostKey, chargeId });
    },
    [code]
  );

  const upsertItem = useCallback(
    (hostKey: string, item: any) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('item:upsert', { code, hostKey, item });
    },
    [code]
  );

  const deleteItem = useCallback(
    (hostKey: string, itemId: string) => {
      if (!socketRef.current || !code) return;
      socketRef.current.emit('item:delete', { code, hostKey, itemId });
    },
    [code]
  );

  return {
    snapshot,
    setSnapshot,
    connected,
    error,
    actions: {
      toggleClaim,
      setClaimPortion,
      markPaid,
      verifyPayment,
      rejectPayment,
      toggleCashPayment,
      setProxyCover,
      setFeeMode,
      addCharge,
      deleteCharge,
      upsertItem,
      deleteItem,
    },
  };
}
