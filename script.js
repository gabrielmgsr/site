const firebaseConfig = {
    apiKey: "AIzaSyBNUAn70ge_y1dIuT6MUorR26llwRZrbc0",
    authDomain: "site-7386d.firebaseapp.com",
    projectId: "site-7386d",
    storageBucket: "site-7386d.firebasestorage.app",
    messagingSenderId: "496420926203",
    appId: "1:496420926203:web:afda39fdfd27853e68765e",
    measurementId: "G-PTKVP8LZ4T"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 24 de Agosto de 2026 (mês começa em 0: 7 = Agosto)
const startDate = new Date(2026, 7, 24, 0, 0, 0);

function updateCounter() {
    const now = new Date();
    const diff = now - startDate;
    if (diff < 0) return;

    const seconds = Math.floor(diff / 1000) % 60;
    const minutes = Math.floor(diff / (1000 * 60)) % 60;
    const hours = Math.floor(diff / (1000 * 60 * 60)) % 24;

    let years = now.getFullYear() - startDate.getFullYear();
    let months = now.getMonth() - startDate.getMonth();
    let days = now.getDate() - startDate.getDate();

    if (days < 0) {
        months--;
        const previousMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        days += previousMonth.getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }

    document.getElementById('years').innerText = years;
    document.getElementById('months').innerText = months;
    document.getElementById('days').innerText = days;
    document.getElementById('hours').innerText = String(hours).padStart(2, '0');
    document.getElementById('minutes').innerText = String(minutes).padStart(2, '0');
    document.getElementById('seconds').innerText = String(seconds).padStart(2, '0');
}

setInterval(updateCounter, 1000);
updateCounter();

// --- COMPRESSÃO DA IMAGEM NO NAVEGADOR ---
function compressImage(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Falha ao ler a imagem.'));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// --- ENVIO DIRETO PARA O FIRESTORE ---
const form = document.getElementById('photo-form');
const submitBtn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const fileInput = document.getElementById('photo-file');
    const dateInput = document.getElementById('photo-date').value;
    const descInput = document.getElementById('photo-desc').value.trim();
    const file = fileInput.files[0];

    if (!file) return;

    submitBtn.disabled = true;
    submitBtn.innerText = 'Comprimindo e enviando...';

    try {
        let compressedBase64 = await compressImage(file, 800, 0.7);

        // Se ainda ficar grande (acima de ~700 KB em caracteres), comprime mais um pouco
        if (compressedBase64.length > 700000) {
            compressedBase64 = await compressImage(file, 600, 0.55);
        }

        if (compressedBase64.length > 950000) {
            throw new Error('A foto ficou grande demais mesmo após compressão. Tente outra imagem.');
        }

        await db.collection('momentos').add({
            image: compressedBase64,
            date: dateInput,
            desc: descInput,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        alert('Foto adicionada com sucesso!');
        form.reset();
    } catch (error) {
        console.error('Erro ao salvar no Firestore:', error);
        alert('Erro ao enviar foto: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = 'Enviar para o Site';
    }
});

// --- MODAL E EXCLUSÃO ---
const modal = document.getElementById('photo-modal');
const modalImg = document.getElementById('modal-img');
const modalDate = document.getElementById('modal-date');
const modalDesc = document.getElementById('modal-desc');
const modalDownload = document.getElementById('modal-download');
const modalDelete = document.getElementById('modal-delete');
const modalClose = document.getElementById('modal-close');
const modalBackdrop = document.getElementById('modal-backdrop');

let currentDocId = null;

async function deletePhoto(docId, desc) {
    const confirmed = confirm(`Tem certeza que deseja excluir esta foto${desc ? `: "${desc}"` : ''}?`);
    if (!confirmed) return;

    try {
        await db.collection('momentos').doc(docId).delete();
        if (currentDocId === docId) {
            closeModal();
        }
    } catch (error) {
        console.error('Erro ao excluir foto:', error);
        alert('Não foi possível excluir a foto: ' + error.message);
    }
}

if (modalDelete) {
    modalDelete.addEventListener('click', () => {
        if (currentDocId) {
            deletePhoto(currentDocId, modalDesc.textContent);
        }
    });
}

function openModal(photo, formattedDate, fileName, docId) {
    currentDocId = docId;
    modalImg.src = photo.image;
    modalImg.alt = photo.desc || 'Momento';
    modalDate.textContent = formattedDate ? `📅 ${formattedDate}` : '';
    modalDesc.textContent = photo.desc || '';
    modalDownload.href = photo.image;
    modalDownload.download = fileName;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function closeModal() {
    currentDocId = null;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    modalImg.src = '';
}

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) {
        closeModal();
    }
});

// --- CARREGAR FOTOS DO FIRESTORE EM TEMPO REAL ---
const galleryGrid = document.getElementById('gallery-grid');

db.collection('momentos')
    .orderBy('timestamp', 'desc')
    .onSnapshot(
        (snapshot) => {
            galleryGrid.innerHTML = '';

            if (snapshot.empty) {
                galleryGrid.innerHTML = '<p style="grid-column: 1/-1; color: #82828c;">Nenhum momento publicado ainda.</p>';
                return;
            }

            snapshot.forEach((doc, index) => {
                const photo = doc.data();

                let formattedDate = photo.date || '';
                if (photo.date) {
                    const parts = photo.date.split('-');
                    if (parts.length === 3) {
                        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                }

                const fileName = `momento-${index + 1}.jpg`;
                const card = document.createElement('div');
                card.className = 'photo-card';
                card.innerHTML = `
                    <div>
                        <img src="${photo.image}" alt="${photo.desc || 'Momento'}">
                        <div class="photo-info">
                            <div class="photo-date">📅 ${formattedDate}</div>
                            <div class="photo-caption">${photo.desc || ''}</div>
                        </div>
                    </div>
                    <div class="card-actions">
                        <a href="${photo.image}" download="${fileName}" class="btn-download">Baixar Foto 📥</a>
                        <button type="button" class="btn-delete">Excluir Foto 🗑️</button>
                    </div>
                `;

                card.querySelector('img').addEventListener('click', () => {
                    openModal(photo, formattedDate, fileName, doc.id);
                });

                card.querySelector('.btn-delete').addEventListener('click', () => {
                    deletePhoto(doc.id, photo.desc || '');
                });

                galleryGrid.appendChild(card);
            });
        },
        (error) => {
            console.error('Erro ao ler momentos:', error);
            galleryGrid.innerHTML = '<p style="grid-column: 1/-1; color: #ff6b81;">Não foi possível carregar as fotos. Verifique as regras do Cloud Firestore.</p>';
        }
    );