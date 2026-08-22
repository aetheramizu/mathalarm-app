import { SpikeRig } from '@/spike/spike-rig';

/**
 * TEMPORARY. The alarm list belongs here; while the native kernel is being
 * proven on-device this route is the test rig instead. Everything it uses lives
 * under `src/spike/`, so reverting is a matter of deleting that folder and
 * restoring the list screen.
 */
export default function AlarmListScreen() {
  return <SpikeRig />;
}
