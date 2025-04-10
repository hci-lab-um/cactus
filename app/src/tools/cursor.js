var mouse = { x: 0, y: 0 }

//window.onload = init;
// function init() {
//   // if (window.Event) {
//   // document.addEventListener(Event.MOUSEMOVE);
//   // }
//   document.onmousemove = setMouseXY;
// }

function setMouseXY(e) {
  mouse.x = (window.Event) ? e.pageX : window.Event.clientX + (document.documentElement.scrollLeft ? document.documentElement.scrollLeft : document.body.scrollLeft);
  mouse.y = (window.Event) ? e.pageY : window.Event.clientY + (document.documentElement.scrollTop ? document.documentElement.scrollTop : document.body.scrollTop);
}

exports.getMouse = () => {
  return mouse;
}

exports.createCursor = (id) => {
  var cursor = document.createElement('div');

  // Needed due to the 'This document requires 'TrustedHTML' assignment' warning
  var cursorHtml = window.sanitizeHTML(`
    <svg id="eyeCursorSVG" aria-hidden="true" focusable="false" data-prefix="far" data-icon="eye"
      class="fa-eye fa-w-18" role="img" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 576 512">
      
      <!-- Static Eye Cursor -->
      <path fill="currentColor" id="staticEye"
        d="M288 144a110.94 110.94 0 0 0-31.24 5 55.4 55.4 0 0 1 7.24 27 56 56 0 0 1-56 56
           55.4 55.4 0 0 1-27-7.24A111.71 111.71 0 1 0 288 144zm284.52 97.4C518.29 135.59 
           410.93 64 288 64S57.68 135.64 3.48 241.41a32.35 32.35 0 0 0 0 29.19C57.71 376.41
           165.07 448 288 448s230.32-71.64 284.52-177.41a32.35 32.35 0 0 0 0-29.19zM288 400
           c-98.65 0-189.09-55-237.93-144C98.91 167 189.34 112 288 112s189.09 55 237.93 144
           C477.1 345 386.66 400 288 400z">
      </path>

      <!-- Filling Circle Effect -->
      <ellipse id="fillingCircle" cx="288" cy="256" rx="0" ry="0" fill="#ff0000" opacity="1"></ellipse>
    </svg>
  `);

  cursor.innerHTML = cursorHtml;
  cursor.setAttribute('id', id);
  cursor.style.width = '50px';
  cursor.style.height = '50px';
  cursor.style.color = "#a091eb";
  cursor.style.opacity = '0.4';
  cursor.style.zIndex = '9999999999';
  cursor.style.position = 'absolute';
  cursor.style.margin = '-20px 0 0 -20px';
  cursor.style['pointer-events'] = 'none';
  document.body.appendChild(cursor);
};

exports.followCursor = (id) => {
  var cursor = document.getElementById(id)
  document.addEventListener('mousemove', setMouseXY, true)

  var cursorPos = { x: 0, y: 0 }

  // Increase interval to make it slower
  setInterval(followMouse, 20)

  function followMouse() {
    var distX = mouse.x - cursorPos.x
    var distY = mouse.y - cursorPos.y

    cursorPos.x += distX / 10
    cursorPos.y += distY / 10

    cursor.style.left = cursorPos.x + 'px'
    cursor.style.top = cursorPos.y + 'px'
  }
}

// // Start Animation (Filling Effect)
// exports.startCursorAnimation = () => {
//   const animatedEye = document.getElementById("animatedEye");
//   if (animatedEye) {
//     animatedEye.style.animation = "overlayDwellAnimation-fillEye 1.5s linear forwards";
//   }
// }

// // Stop Animation (Reset to Empty)
// exports.stopCursorAnimation = () => {
//   const animatedEye = document.getElementById("animatedEye");
//   if (animatedEye) {
//     animatedEye.style.animation = "none";
//     animatedEye.style.clipPath = "inset(100% 0 0 0)"; // Resets fill
//   }
// }

// Start Animation (Filling Circle)
exports.startCursorAnimation = () => {
  const fillingCircle = document.getElementById("fillingCircle");
  if (fillingCircle) {
    fillingCircle.style.transition = "rx 1.5s linear, ry 1.5s linear";
    fillingCircle.setAttribute("rx", "300");
    fillingCircle.setAttribute("ry", "210"); 
  }
};

// Stop Animation (Reset Circle)
exports.stopCursorAnimation = () => {
  const fillingCircle = document.getElementById("fillingCircle");
  if (fillingCircle) {
    fillingCircle.style.transition = "none";
    fillingCircle.setAttribute("rx", "0");
    fillingCircle.setAttribute("ry", "0");
  }
};