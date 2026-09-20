/**
 * Utility script to view and update room availability in Firestore
 * 
 * Examples:
 *   node set-room.js                  -> Shows all rooms and current availability
 *   node set-room.js 3                -> Sets Triple Occupancy Room to 3 available
 *   node set-room.js triple 2         -> Sets Triple Occupancy Room to 2 available
 *   node set-room.js commercial 1     -> Sets Commercial Space to 1 available
 */

const PROJECT_ID = 'capstoneapt-b5681';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/rooms`;

const ROOM_MAP = {
  'triple': { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  'triple occupancy': { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  'triple occupancy room': { id: 'triple-occupancy-room', name: 'Triple Occupancy Room' },
  'commercial': { id: 'commercial-space', name: 'Commercial Space' },
  'commercial space': { id: 'commercial-space', name: 'Commercial Space' },
};

async function getRooms() {
  const res = await fetch(BASE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch rooms: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return (data.documents || []).map(doc => {
    const parts = doc.name.split('/');
    const docId = parts[parts.length - 1];
    const available = doc.fields?.available?.integerValue !== undefined
      ? parseInt(doc.fields.available.integerValue, 10)
      : (doc.fields?.available?.doubleValue ?? 'N/A');
    const name = doc.fields?.name?.stringValue || docId;
    return { docId, name, available };
  });
}

async function setAvailability(docId, roomName, count) {
  const url = `${BASE_URL}/${docId}?updateMask.fieldPaths=available&updateMask.fieldPaths=name`;
  const body = {
    fields: {
      name: { stringValue: roomName },
      available: { integerValue: count }
    }
  };

  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to update ${docId}: ${res.status} ${errText}`);
  }

  return await res.json();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('\n📊 Current Room Availability in Firestore:');
    console.log('-------------------------------------------');
    try {
      const rooms = await getRooms();
      rooms.forEach(r => {
        console.log(`• ${r.name} (${r.docId}): ${r.available} available`);
      });
      console.log('-------------------------------------------');
      console.log('To change availability, run:');
      console.log('  node set-room.js 3            (sets Triple Occupancy Room to 3)');
      console.log('  node set-room.js triple 2     (sets Triple Occupancy Room to 2)');
      console.log('  node set-room.js commercial 1 (sets Commercial Space to 1)\n');
    } catch (err) {
      console.error('Error:', err.message);
    }
    return;
  }

  let targetRoomKey = 'triple';
  let targetCount = null;

  if (args.length === 1) {
    // e.g. node set-room.js 3
    const num = parseInt(args[0], 10);
    if (!isNaN(num)) {
      targetCount = num;
    } else {
      targetRoomKey = args[0].toLowerCase();
    }
  } else {
    // e.g. node set-room.js triple 3
    targetRoomKey = args[0].toLowerCase();
    targetCount = parseInt(args[1], 10);
  }

  if (targetCount === null || isNaN(targetCount)) {
    console.error('❌ Please provide a valid number for room availability.');
    console.error('Example: node set-room.js 3');
    process.exit(1);
  }

  const roomConfig = ROOM_MAP[targetRoomKey] || {
    id: targetRoomKey.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name: targetRoomKey
  };

  try {
    console.log(`Updating "${roomConfig.name}" to ${targetCount} available rooms...`);
    await setAvailability(roomConfig.id, roomConfig.name, targetCount);
    console.log(`✅ Success! "${roomConfig.name}" is now set to ${targetCount} available in Firestore.`);
    console.log('   All open browsers (index.html and property-detail.html) will update in real time!\n');
  } catch (err) {
    console.error('❌ Update failed:', err.message);
    process.exit(1);
  }
}

main();
