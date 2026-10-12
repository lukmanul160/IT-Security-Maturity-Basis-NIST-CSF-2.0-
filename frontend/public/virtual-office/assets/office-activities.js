export const activities = [
  { name: 'Minum kopi', area: 'cafe', pose: 'coffee' },
  { name: 'Makan di kafetaria', area: 'cafe', pose: 'eat' },
  { name: 'Tidur sambil duduk di lounge', area: 'lounge', pose: 'sleep' },
  { name: 'Ke toilet', area: 'toilet', pose: 'toilet' },
  { name: 'Keliling kantor', area: 'waiting', pose: 'walk' },
  { name: 'Membaca buku', area: 'lounge', pose: 'read' },
  { name: 'Mengecek ponsel', area: 'lounge', pose: 'phone' },
  { name: 'Peregangan', area: 'waiting', pose: 'stretch' },
  { name: 'Mengobrol di lounge', area: 'lounge', pose: 'chat' },
  { name: 'Menikmati camilan', area: 'cafe', pose: 'eat' },
  { name: 'Minum air', area: 'cafe', pose: 'water' },
  { name: 'Merawat tanaman', area: 'garden', pose: 'garden' },
];

export function chooseActivity(seed, phase) {
  return activities[((phase * 5 + seed) % activities.length + activities.length) % activities.length];
}

export function createPlaceReservations() {
  const occupied = new Map(), assigned = new Map();
  return {
    reserve(id, area, slots) {
      const previous = assigned.get(id);
      if (previous?.area === area && slots.some(slot => slot.key === previous.key)) return previous;
      this.release(id);
      const free = slots.find(slot => !occupied.has(slot.key));
      if (!free) return null;
      const place = { ...free, area };
      occupied.set(place.key, id); assigned.set(id, place);
      return place;
    },
    release(id) {
      const place = assigned.get(id);
      if (place) { occupied.delete(place.key); assigned.delete(id); }
    },
    clear() { occupied.clear(); assigned.clear(); },
  };
}

// Spatial buckets keep crowd separation linear for normal office density.
export function createCrowdGrid(distance = .85) {
  const buckets = new Map(), locations = new Map();
  const key = (x,z) => `${Math.floor(x / distance)},${Math.floor(z / distance)}`;
  return {
    clear() { buckets.clear(); locations.clear(); },
    update(id, position, visible = true) {
      const old = locations.get(id);
      if (old) buckets.get(old.key)?.delete(id);
      locations.delete(id);
      if (!visible) return;
      const bucketKey = key(position.x,position.z);
      if (!buckets.has(bucketKey)) buckets.set(bucketKey,new Map());
      const location = { x: position.x, z: position.z, key: bucketKey };
      buckets.get(bucketKey).set(id,location); locations.set(id,location);
    },
    canMove(id, position) {
      const x=Math.floor(position.x/distance),z=Math.floor(position.z/distance);
      for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++) {
        const bucket=buckets.get(`${x+dx},${z+dz}`);
        if(bucket)for(const [other,point] of bucket) {
          if(other!==id&&(point.x-position.x)**2+(point.z-position.z)**2<distance**2)return false;
        }
      }
      return true;
    },
  };
}
