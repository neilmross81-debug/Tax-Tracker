import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAT0OXq1NTvUNCFy0FkVubsVoxLCApWa2k",
    authDomain: "taxtracker-c63c8.firebaseapp.com",
    projectId: "taxtracker-c63c8",
    storageBucket: "taxtracker-c63c8.firebasestorage.app",
    messagingSenderId: "228332834418",
    appId: "1:228332834418:web:9e31d9d894ad350adcbceb",
    measurementId: "G-T61L3ZK78E"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
