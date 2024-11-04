const config = require('config');
const { throttle } = require('lodash')

let dwellTime = config.get('dwelling.dwellTime');
let keyboardDwellTime = config.get('dwelling.keyboardDwellTime');
let intervalIds = []; // this is needed because some keys create multiple intervals and hence all of them need to be cleared on mouseout
let isDwellingActive = true;

module.exports = {
  byId: (id) => {
    return document.getElementById(id);
  },

  readFile: (file, callback) => {
    var rawFile = new XMLHttpRequest()
    rawFile.open("GET", file, true)

    rawFile.onreadystatechange = () => {
      if (rawFile.readyState === 4) {
        if (rawFile.status === 200 || rawFile.status == 0) {
          callback(rawFile.responseText, null)
        }
      }
    }
    rawFile.send(null)
  },

  // dwell: (elem, callback) => {
  //   var timeout = 0
  //   elem.onmouseover = () => {
  //     timeout = setTimeout(callback, dwellTime)
  //   };

  //   elem.onmouseout = () => {
  //     clearTimeout(timeout)
  //   }
  // },

  // dwell: (elem, callback) => {
  //   elem.onmouseover = () => {
  //     Timeout.set(callback, dwellTime)
  //   }

  //   elem.onmouseout = () => {
  //     Timeout.clear(callback)
  //   }
  // },

  getIsDwellingActive: () => {
    return isDwellingActive;
  },

  // toggleDwelling: () => {
  //   isDwellingActive = !isDwellingActive;
  //   config.dwelling.isDwellingActive = isDwellingActive
  //   console.log('Dwelling is now ' + (isDwellingActive ? 'active' : 'inactive'));
  // },

  dwell: (elem, callback, isKeyboardBtn = false) => {
    // If the dwelling is for a keyboard button, use the keyboard dwell time, otherwise use the default dwell time
    let dwellTimeToUse = isKeyboardBtn ? keyboardDwellTime : dwellTime;
    let throttledFunction = throttle(callback, dwellTimeToUse, { leading: false, trailing: true });

    //Bypass dwelling in case a switch is being used
    elem.addEventListener('click', callback)

    //Dwelling
    elem.addEventListener('mouseenter', () => {
      console.log("isActive: ", config.dwelling.isDwellingActive);
      if (config.dwelling.isDwellingActive) throttledFunction();
    });
    elem.addEventListener('mouseleave', () => {
      throttledFunction.cancel()
    })
  },

  dwellInfinite: (elem, callback, isActive) => {
    // Bypass dwelling in case a switch is being used
    elem.addEventListener('click', callback);

    // Start dwelling on mouseover
    elem.addEventListener('mouseenter', () => {
      // console.log("isActive: ", isActive);
      if (config.dwelling.isDwellingActive) {
        // Clears any existing intervals to avoid multiple intervals running simultaneously
        if (intervalIds.length !== 0) {
          intervalIds.forEach(intervalId => {
            clearInterval(intervalId);
          });
        }
        intervalIds.push(setInterval(() => {
          if (config.dwelling.isDwellingActive) callback();
        }, keyboardDwellTime));
      }
    });

    // Stop dwelling on mouse leave
    elem.addEventListener('mouseleave', () => {
      if (intervalIds.length !== 0) {
        intervalIds.forEach(intervalId => {
          clearInterval(intervalId);
        });
        intervalIds = [];
      }
    });
  },

  genId: () => {
    return '_' + Math.random().toString(36).substr(2, 9)
  },

  // The following method is duplicated in the render-tabview.js - the only place that uses it, hence it can be removed from here
  // generateUUID: () => {
  //   return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
  //     const r = Math.random() * 16 | 0;
  //     const v = c === 'x' ? r : (r & 0x3 | 0x8);
  //     return v.toString(16);
  //   });
  // },

  isElementANavElement: element => {
    var parentNav = element.closest('nav')
    var parentRoleNav = element.closest('div[role="navigation"]')

    return (parentNav || parentRoleNav) ? true : false
  },

  // This function was only used in the render-browserview, hence it can be removed from here as it is now placed in render-tabview
  // scrollBy: (amountX, amountY) => {

  //   //This is an ugly solution to a problem whereby on certain pages, document.body.scrollBy works (e.g. wikipedia) and in others document.documentElement.scrollby does (e.g. times)
  //   document.body.scrollBy({
  //     top: amountY,
  //     left: amountX,
  //     behavior: "smooth"
  //   });

  //   document.documentElement.scrollBy({
  //     top: amountY,
  //     left: amountX,
  //     behavior: "smooth"
  //   });
  // }
}
