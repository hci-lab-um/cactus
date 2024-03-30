const config = require('./config')
const { throttle } = require('lodash')

let dwellTime = config.dwellTime;

module.exports = {
  byId: (id) => {
    return document.getElementById(id);
  },

  readFile: (file, callback) => {
    var rawFile = new XMLHttpRequest()
    rawFile.open("GET", file, true)
  
    rawFile.onreadystatechange = () => {
      if(rawFile.readyState === 4) {
        if(rawFile.status === 200 || rawFile.status == 0) {
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

  dwell: (elem, callback) => {
    let throttledFunction = throttle(callback, dwellTime, { leading: false, trailing: true })

    elem.addEventListener('mouseover', throttledFunction)
    elem.addEventListener('mouseleave', () => {
      throttledFunction.cancel()
    })
  },

  genId: () => {
    return '_' + Math.random().toString(36).substr(2, 9)
  },

  isElementANavElement: element => {
    var parentNav = element.closest('nav')
    var parentRoleNav = element.closest('div[role="navigation"]')

    return (parentNav || parentRoleNav) ? true : false
  },

  scrollBy: (amountX, amountY) => {

    //This is an ugly solution to a problem whereby on certain pages, document.body.scrollBy works (e.g. wikipedia) and in others document.documentElement.scrollby does (e.g. times)
    document.body.scrollBy({
      top: amountY,
      left: amountX,
      behavior : "smooth"
    });
    
    document.documentElement.scrollBy({
        top: amountY,
        left: amountX,
        behavior : "smooth"
      });
  }
}
