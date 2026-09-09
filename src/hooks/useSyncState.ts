import { useEffect, useState } from 'react';
import { getSyncState, subscribeSync, type SyncState } from '../services/syncService';

export function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>(getSyncState);
  useEffect(() => subscribeSync(setState), []);
  return state;
}
