export const activities = [
  { name: 'Membuat kopi', area: 'brew', pose: 'brew' },
  { name: 'Main PlayStation', area: 'gaming', pose: 'game' },
  { name: 'Memantau command center', area: 'monitoring', pose: 'monitor' },
  { name: 'Main pingpong', area: 'pingpong', pose: 'pingpong' },
  { name: 'Mengobrol sambil minum', area: 'lounge', pose: 'chatDrink' },
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
  return activities[((phase * 7 + seed) % activities.length + activities.length) % activities.length];
}

export function shuffledDeskSlots(desks, lastKey, random = Math.random) {
  const slots = desks.map((desk, index) => ({ x: desk.x, z: desk.z + 1, index, key: `desk-${index}` }));
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  // Prefer a different desk when this user starts another active session.
  return [...slots.filter(slot => slot.key !== lastKey), ...slots.filter(slot => slot.key === lastKey)];
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

// Clearance includes the avatar body, not only its center.
export const toiletWalls = [
  { minX: 4.6, maxX: 15.4, minZ: 8.55, maxZ: 9.45 },
  { minX: 9.55, maxX: 10.45, minZ: 8.7, maxZ: 12.5 },
  { minX: 6.1, maxX: 13.9, minZ: 11.55, maxZ: 12.45 },
];
export function canTraverseOffice(from, to) {
  return !toiletWalls.some(wall => {
    let start = 0, end = 1;
    for (const axis of ['X', 'Z']) {
      const key = axis.toLowerCase(), delta = to[key] - from[key];
      if (Math.abs(delta) < 1e-9) {
        if (from[key] < wall['min' + axis] || from[key] > wall['max' + axis]) return false;
      } else {
        const a = (wall['min' + axis] - from[key]) / delta;
        const b = (wall['max' + axis] - from[key]) / delta;
        start = Math.max(start, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
      }
    }
    return start <= end;
  });
}
export function toiletAccess(x) {
  // Separate entrances on either side of the central divider.
  const outside = x < 10 ? 4 : 16;
  return [{ x: outside, z: 8 }, { x: outside, z: 10.2 }, { x, z: 10.2 }, { x, z: 11 }];
}
