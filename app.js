// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBAJ3tjRZvAXP6CFJjirxGwAs9VjBqOLL8",
  authDomain: "timetracker-d694e.firebaseapp.com",
  projectId: "timetracker-d694e",
  storageBucket: "timetracker-d694e.firebasestorage.app",
  messagingSenderId: "145782306367",
  appId: "1:145782306367:web:a3b2897c838a19ab95ea8a",
  measurementId: "G-YW6C47L5XS"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence
db.enablePersistence()
  .catch((err) => {
      console.warn("Persistence error:", err.code);
  });

// State
let records = [];
let currentWeekStart = null;

// DOM Elements
const form = document.getElementById('recordForm');
const dateInput = document.getElementById('date');
const startTimeInput = document.getElementById('startTime');
const endTimeInput = document.getElementById('endTime');
const calculatedHoursEl = document.getElementById('calculatedHours');
const hourlyRateInput = document.getElementById('hourlyRate');
const statusInput = document.getElementById('status');
const recordsList = document.getElementById('recordsList');

const totalEarnedEl = document.getElementById('totalEarned');
const totalHoursEl = document.getElementById('totalHours');
const paidEarnedEl = document.getElementById('paidEarned');
const paidHoursEl = document.getElementById('paidHours');
const pendingEarnedEl = document.getElementById('pendingEarned');
const pendingHoursEl = document.getElementById('pendingHours');
const currentWeekLabel = document.getElementById('currentWeekLabel');

const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');

const exportBtn = document.getElementById('exportBtn');
const importFile = document.getElementById('importFile');
const clearBtn = document.getElementById('clearBtn');

// Initialization
function init() {
    // Generate time options for selects
    function generateTimeOptions(selectEl) {
        for (let h = 0; h < 24; h++) {
            for (let m of ['00', '30']) {
                const hourStr = h.toString().padStart(2, '0');
                const timeStr24 = `${hourStr}:${m}`;
                const ampm = h >= 12 ? 'PM' : 'AM';
                let h12 = h % 12;
                h12 = h12 ? h12 : 12;
                const timeStr12 = `${h12.toString().padStart(2, '0')}:${m} ${ampm}`;
                
                const option = document.createElement('option');
                option.value = timeStr24;
                option.innerText = timeStr12;
                selectEl.appendChild(option);
            }
        }
    }
    generateTimeOptions(startTimeInput);
    generateTimeOptions(endTimeInput);

    // Set default date to today
    dateInput.valueAsDate = new Date();
    
    // Load data from LocalStorage and Migrate to Firebase
    const savedData = localStorage.getItem('horasTrackData');
    if (savedData) {
        const localRecords = JSON.parse(savedData);
        if (localRecords.length > 0) {
            console.log("Migrando datos locales a Firebase...");
            localRecords.forEach(record => {
                const { id, ...dataToSave } = record; // remove old manual id
                db.collection('records').add(dataToSave);
            });
            localStorage.removeItem('horasTrackData');
            alert("¡Tus datos locales han sido sincronizados a la nube exitosamente!");
        }
    }
    
    // Subscribe to Firestore updates
    db.collection('records').onSnapshot((snapshot) => {
        records = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            data.id = doc.id; // use Firestore ID
            records.push(data);
        });
        
        // Sort records by date (newest first)
        records.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (currentWeekStart) {
            updateUI();
        }
    });
    
    // Load last rate
    const lastRate = localStorage.getItem('horasTrackRate');
    if (lastRate) {
        hourlyRateInput.value = lastRate;
    }
    
    // Set current week to this week
    currentWeekStart = getStartOfWeek(new Date());
    
    updateUI();
}

// Helpers
function getStartOfWeek(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(d.setDate(diff));
}

function getEndOfWeek(startDate) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
}

function formatDate(dateString) {
    const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
    const d = new Date(dateString);
    // Adjust for timezone offset to avoid showing previous day
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    return d.toLocaleDateString('es-ES', options);
}

function getWeekLabel(start, end) {
    const options = { month: 'short', day: 'numeric' };
    return `${start.toLocaleDateString('es-ES', options)} - ${end.toLocaleDateString('es-ES', options)}`;
}

// Time calculation
function to12hFormat(time24) {
    if (!time24) return '';
    const [hStr, m] = time24.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    return `${h.toString().padStart(2, '0')}:${m} ${ampm}`;
}

function calculateHours() {
    const start = startTimeInput.value;
    const end = endTimeInput.value;
    if (start && end) {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        let diffHours = endH - startH;
        let diffMins = endM - startM;
        if (diffMins < 0) {
            diffHours -= 1;
            diffMins += 60;
        }
        if (diffHours < 0) {
            diffHours += 24; // Handle passing midnight
        }
        const total = diffHours + (diffMins / 60);
        calculatedHoursEl.innerText = total.toFixed(2).replace(/\.00$/, '');
        return total;
    }
    calculatedHoursEl.innerText = '0';
    return 0;
}

startTimeInput.addEventListener('change', calculateHours);
endTimeInput.addEventListener('change', calculateHours);

// Data operations
function saveRecord(e) {
    e.preventDefault();
    
    const calculatedHours = calculateHours();
    if (calculatedHours <= 0) {
        alert("Asegúrate de ingresar una hora de inicio y final válidas.");
        return;
    }
    
    const rate = parseFloat(hourlyRateInput.value) || 0;
    const newRecord = {
        date: dateInput.value,
        startTime: startTimeInput.value,
        endTime: endTimeInput.value,
        hours: calculatedHours,
        rate: rate,
        status: statusInput.value
    };
    
    // Save rate for next time
    localStorage.setItem('horasTrackRate', rate);
    
    // Guardar en Firestore (funciona offline)
    db.collection('records').add(newRecord);
    
    // Reset form
    startTimeInput.selectedIndex = 0;
    endTimeInput.selectedIndex = 0;
    calculatedHoursEl.innerText = '0';
    
    // Update view if the new record is in the currently viewed week
    const recordDate = new Date(newRecord.date);
    recordDate.setMinutes(recordDate.getMinutes() + recordDate.getTimezoneOffset());
    
    // Jump to the week of the new record to show it immediately
    currentWeekStart = getStartOfWeek(recordDate);
    
    // Note: updateUI() is called automatically by onSnapshot
    
    // Small animation effect on button
    const btn = form.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = '¡Guardado!';
    btn.style.backgroundColor = 'var(--success)';
    setTimeout(() => {
        btn.innerText = originalText;
        btn.style.backgroundColor = '';
    }, 1500);
}

// Attach to window so it can be called from inline onclick in HTML
window.deleteRecord = function(id) {
    if(confirm('¿Estás seguro de eliminar este registro?')) {
        db.collection('records').doc(id).delete();
    }
};

window.toggleStatus = function(id) {
    const record = records.find(r => r.id === id);
    if(record) {
        const newStatus = record.status === 'paid' ? 'pending' : 'paid';
        db.collection('records').doc(id).update({ status: newStatus });
    }
};

// UI Updates
function updateUI() {
    const endOfWeek = getEndOfWeek(currentWeekStart);
    currentWeekLabel.innerText = getWeekLabel(currentWeekStart, endOfWeek);
    
    // Filter records for current week
    const weekRecords = records.filter(record => {
        const d = new Date(record.date);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
        return d >= currentWeekStart && d <= endOfWeek;
    });
    
    // Calculate stats
    let totalHours = 0;
    let paidHours = 0;
    let pendingHours = 0;
    
    let totalEarned = 0;
    let paidEarned = 0;
    let pendingEarned = 0;
    
    weekRecords.forEach(r => {
        const rate = r.rate || 0;
        const earned = r.hours * rate;
        
        totalHours += r.hours;
        totalEarned += earned;
        
        if (r.status === 'paid') {
            paidHours += r.hours;
            paidEarned += earned;
        }
        if (r.status === 'pending') {
            pendingHours += r.hours;
            pendingEarned += earned;
        }
    });
    
    // Animate numbers (Hours)
    totalHoursEl.innerText = `${totalHours.toFixed(2).replace(/\.00$/, '')} horas`;
    paidHoursEl.innerText = `${paidHours.toFixed(2).replace(/\.00$/, '')} horas`;
    pendingHoursEl.innerText = `${pendingHours.toFixed(2).replace(/\.00$/, '')} horas`;
    
    // Animate numbers (Money)
    animateValueMoney(totalEarnedEl, parseFloat(totalEarnedEl.innerText.replace('$', '')) || 0, totalEarned, 500);
    animateValueMoney(paidEarnedEl, parseFloat(paidEarnedEl.innerText.replace('$', '')) || 0, paidEarned, 500);
    animateValueMoney(pendingEarnedEl, parseFloat(pendingEarnedEl.innerText.replace('$', '')) || 0, pendingEarned, 500);
    
    // Render list
    recordsList.innerHTML = '';
    
    if (weekRecords.length === 0) {
        recordsList.innerHTML = '<li class="record-item"><p style="color: var(--text-muted); text-align: center; width: 100%;">No hay registros esta semana.</p></li>';
    } else {
        weekRecords.forEach(record => {
            const li = document.createElement('li');
            li.className = 'record-item';
            
            const isPaid = record.status === 'paid';
            const badgeClass = isPaid ? 'paid' : 'pending';
            const badgeText = isPaid ? 'Pagado' : 'Pendiente';
            
            const timeInfo = record.startTime && record.endTime 
                ? `<span style="font-size: 0.8rem; color: var(--text-muted); display: block;">${to12hFormat(record.startTime)} - ${to12hFormat(record.endTime)}</span>`
                : '';
                
            li.innerHTML = `
                <div class="record-info">
                    <span class="record-date">${formatDate(record.date)}</span>
                    ${timeInfo}
                    <span class="record-hours">
                        ${record.rate ? `<strong>$${(record.hours * record.rate).toFixed(2)}</strong> (${parseFloat(record.hours).toFixed(2).replace(/\.00$/, '')}h)` : `${parseFloat(record.hours).toFixed(2).replace(/\.00$/, '')} horas`}
                    </span>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <span class="badge ${badgeClass}" style="cursor:pointer;" onclick="toggleStatus('${record.id}')" title="Clic para cambiar estado">${badgeText}</span>
                    <button class="btn-icon" onclick="deleteRecord('${record.id}')" style="color: var(--danger); font-size: 1rem;" title="Eliminar registro">✕</button>
                </div>
            `;
            recordsList.appendChild(li);
        });
    }
}

// Animation utility
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = (progress * (end - start) + start).toFixed(1).replace(/\.0$/, '');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function animateValueMoney(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = (progress * (end - start) + start);
        obj.innerHTML = '$' + current.toFixed(2);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Event Listeners
form.addEventListener('submit', saveRecord);

prevWeekBtn.addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    updateUI();
});

nextWeekBtn.addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    updateUI();
});

// Export Data
exportBtn.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(records));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "horas_track_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});

// Clear Form Fields
clearBtn.addEventListener('click', () => {
    startTimeInput.selectedIndex = 0;
    endTimeInput.selectedIndex = 0;
    hourlyRateInput.value = '';
    calculatedHoursEl.innerText = '0';
});

// Import Data
importFile.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if(Array.isArray(importedData)) {
                importedData.forEach(record => {
                    const { id, ...dataToSave } = record;
                    db.collection('records').add(dataToSave);
                });
                alert('Datos importados a la nube correctamente.');
            } else {
                alert('El archivo no tiene un formato válido.');
            }
        } catch(err) {
            alert('Error al leer el archivo.');
        }
    };
    reader.readAsText(file);
    importFile.value = ''; // reset
});

// Start app
init();
