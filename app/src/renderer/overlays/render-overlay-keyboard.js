const { ipcRenderer } = require('electron');
const config = require('config');
const fs = require('fs');
const path = require('path');
const { dwell } = require('../../../src/tools/utils');
const { createCursor, followCursor } = require('../../../src/tools/cursor')
const DOMPurify = require('dompurify');

// Exposes an HTML sanitizer to allow for innerHtml assignments when TrustedHTML policies are set ('This document requires 'TrustedHTML' assignment')
window.addEventListener('DOMContentLoaded', () => {
	// Expose DOMPurify to the renderer process
	window.sanitizeHTML = (html) => {
		return DOMPurify.sanitize(html, { RETURN_TRUSTED_TYPE: true });
	};

	//Init cursor
	createCursor('cactus_cursor');
	followCursor('cactus_cursor');
});

ipcRenderer.on('ipc-main-keyboard-loaded', () => {
    const defaultLayout = config.get('keyboard.defaultLayout');
    loadKeyboardLayout(defaultLayout);

    // setup event listeners
    // - for backspace
    // document.getElementById('backspace').addEventListener('click', () => {
    //     const textbox = document.getElementById('textbox');
    //     textbox.value = textbox.value.slice(0, -1);
    // });

    // - for shift key to display layout.main_keys.shift
    

});

function loadKeyboardLayout(layout) {
  const layoutPath = path.join(__dirname, '../../pages/json/keyboard/', `${layout}.json`);
  fs.readFile(layoutPath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error loading keyboard layout:', err);
        return;
    }
    const keyboardLayout = JSON.parse(data);
    renderKeyboard(keyboardLayout);
  });
}

function renderKeyboard(layout) {
    const keyboardContainer = document.getElementById('keyboard-container');
    keyboardContainer.innerHTML = ''; // Clear existing keys

    layout.main_keys.default.forEach(row => {
        const rowDiv = document.createElement('div');
        rowDiv.classList.add('keyboard-row');
        row.forEach(key => {
        const keyDiv = document.createElement('div');
        keyDiv.classList.add('keyboard-key');
        keyDiv.textContent = key;
        dwell(keyDiv, () => handleKeyPress(key));
        rowDiv.appendChild(keyDiv);
        });
        keyboardContainer.appendChild(rowDiv);
    });
}

function handleKeyPress(key) {
    document.getElementById('textbox').value += key;
}