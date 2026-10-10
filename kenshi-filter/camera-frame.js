export const TRACK_INTERVAL_MS=33;
// Do not advance the visible background between pose inference frames. The
// image being composed and the pose being displayed share the same snapshot.
export function cameraFrameDue(now,lastDetection,modelReady=true){
  return !modelReady||now-(lastDetection??-Infinity)>=TRACK_INTERVAL_MS;
}
