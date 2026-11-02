type SessionSocket = {
  on(event: 'auth:revoked', listener: () => void): unknown;
  on(event: 'connect_error', listener: (error: Error) => void): unknown;
  off(event: 'auth:revoked', listener: () => void): unknown;
  off(event: 'connect_error', listener: (error: Error) => void): unknown;
};

export function listenForSessionRevocation(socket: SessionSocket, onExpired: () => void) {
  const onError = (error: Error) => { if (error.message === 'unauthorized') onExpired(); };
  socket.on('auth:revoked', onExpired);
  socket.on('connect_error', onError);
  return () => { socket.off('auth:revoked', onExpired); socket.off('connect_error', onError); };
}
