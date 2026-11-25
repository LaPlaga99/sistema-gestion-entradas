import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, getDoc, setDoc, getDocs, writeBatch, deleteField } from 'firebase/firestore';

export const appId = 'event-tickets-admin-v1';

const firebaseConfig = {
  apiKey: "AIzaSyBuPc_eomrdE5FCWFQJikaSgWKI2FFceoY",
  authDomain: "gestion-eventos-f750e.firebaseapp.com",
  projectId: "gestion-eventos-f750e",
  storageBucket: "gestion-eventos-f750e.firebasestorage.app",
  messagingSenderId: "404066870963",
  appId: "1:404066870963:web:66de28774e0715664b32c6",
  measurementId: "G-3NWW8QFCY9"
};

export const DEFAULT_EVENT_CONFIG = {
  title: 'Sinfónica de Chiclayo',
  subtitle: 'CONCIERTO DE LA SINFÓNICA DE CHICLAYO',
  mapHeading: 'DISTRIBUCIÓN DE BUTACAS',
  stageLabel: 'ESCENARIO',
  zones: {
    'grid-platinum': { name: 'PLATINUM', tag: '', price: 40, start: 1, end: 168, containerId: 'container-platinum' },
    'grid-vip-a': { name: 'VIP A', tag: 'COLABORACIONES', price: 30, start: 169, end: 300, containerId: 'container-vip-a' },
    'grid-vip-b': { name: 'VIP B', tag: 'COLABORACIONES', price: 30, start: 301, end: 432, containerId: 'container-vip-b' },
    'grid-gen-a': { name: 'GENERAL A', tag: '', price: 20, start: 433, end: 542, containerId: 'container-gen-a' },
    'grid-gen-b': { name: 'GENERAL B', tag: '', price: 25, start: 543, end: 682, containerId: 'container-gen-b' },
    'grid-gen-c': { name: 'GENERAL C', tag: '', price: 20, start: 683, end: 792, containerId: 'container-gen-c' }
  }
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export const state = {
  eventConfig: JSON.parse(JSON.stringify(DEFAULT_EVENT_CONFIG)),
  seatsData: {},
  integrantsList: [],
  operatorSelectedSeats: new Set(),
  currentHighlightedIntegrantId: null,
  highlightedIntegrantSeats: new Set(),
  editingIntegrantId: null,
  currentUserRole: 'guest'
};

export const getMapDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'tickets', 'seating_map');
export const getEventConfigDocRef = () => doc(db, 'artifacts', appId, 'public', 'data', 'tickets', 'event_config');

export function getSeatZone(seatNum) {
  for (const [gridId, zone] of Object.entries(state.eventConfig.zones)) {
    if (seatNum >= zone.start && seatNum <= zone.end) return { gridId, ...zone };
  }
  return null;
}

export function calculateTotalAmount(seats) {
  let total = 0;
  (seats || []).forEach(sNum => {
    const zone = getSeatZone(sNum);
    if (zone) total += Number(zone.price || 0);
  });
  return total;
}

export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutUser = () => signOut(auth);

export async function saveEventConfig(payload) {
  await setDoc(getEventConfigDocRef(), payload, { merge: true });
}

export async function saveIntegrantAssignment({ name, dni, seatStatus, seatsArray }) {
  const targetId = state.editingIntegrantId || ('int_' + Date.now());
  const atomicMapUpdates = {};

  for (const [sNum, sInfo] of Object.entries(state.seatsData)) {
    if (sInfo && (
      (state.editingIntegrantId && sInfo.integrantId === state.editingIntegrantId) ||
      (sInfo.clientName && sInfo.clientName.toLowerCase() === name.toLowerCase())
    )) {
      atomicMapUpdates[`seats.${sNum}`] = deleteField();
    }
  }

  seatsArray.forEach(sNum => {
    atomicMapUpdates[`seats.${sNum}`] = {
      status: seatStatus,
      clientName: name,
      clientDni: dni,
      integrantId: targetId,
      updatedAt: new Date().toISOString()
    };
  });

  const batch = writeBatch(db);
  batch.update(getMapDocRef(), atomicMapUpdates);
  batch.set(doc(db, 'integrants', targetId), {
    name,
    dni,
    seatStatus,
    seats: seatsArray,
    updatedAt: new Date().toISOString()
  }, { merge: true });

  await batch.commit();
}

export async function deleteIntegrantAndSeats(item) {
  const batch = writeBatch(db);
  const atomicUpdates = {};
  for (const sNum of (item.seats || [])) {
    atomicUpdates[`seats.${sNum}`] = deleteField();
  }
  if (Object.keys(atomicUpdates).length > 0) {
    batch.update(getMapDocRef(), atomicUpdates);
  }
  batch.delete(doc(db, 'integrants', item.id));
  await batch.commit();
}

export async function resetAllData() {
  const batch = writeBatch(db);
  const integrantsSnap = await getDocs(collection(db, 'integrants'));
  integrantsSnap.forEach((d) => batch.delete(d.ref));
  batch.set(getMapDocRef(), { seats: {} });
  await batch.commit();
}

export function subscribeRealtimeData(callbacks) {
  onSnapshot(getEventConfigDocRef(), (cfgSnap) => {
    if (cfgSnap.exists()) {
      const remote = cfgSnap.data();
      state.eventConfig = {
        ...DEFAULT_EVENT_CONFIG,
        ...remote,
        zones: { ...DEFAULT_EVENT_CONFIG.zones, ...(remote.zones || {}) }
      };
    } else {
      state.eventConfig = JSON.parse(JSON.stringify(DEFAULT_EVENT_CONFIG));
    }
    callbacks.onConfigChange();
  });

  onSnapshot(getMapDocRef(), (docSnap) => {
    state.seatsData = docSnap.exists() ? (docSnap.data().seats || {}) : {};
    callbacks.onMapChange();
  });

  let unsubscribeIntegrants = null;

  onAuthStateChanged(auth, async (user) => {
    if (unsubscribeIntegrants) {
      unsubscribeIntegrants();
      unsubscribeIntegrants = null;
    }

    if (user) {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        state.currentUserRole = (userSnap.exists() && userSnap.data().role) ? userSnap.data().role : 'guest';
      } catch {
        state.currentUserRole = 'guest';
      }

      if (state.currentUserRole === 'admin' || state.currentUserRole === 'operator') {
        unsubscribeIntegrants = onSnapshot(collection(db, 'integrants'), (querySnap) => {
          state.integrantsList = [];
          querySnap.forEach((d) => state.integrantsList.push({ id: d.id, ...d.data() }));
          callbacks.onIntegrantsChange();
        });
      }
    } else {
      state.currentUserRole = 'guest';
      state.integrantsList = [];
    }
    callbacks.onAuthChange(user);
  });
}