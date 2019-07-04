const { ipcRenderer, webFrame }               = require('electron')
const { createCursor, followCursor }          = require('./js/cursor.js')
const { Link, Rectangle, QuadTree }           = require('./js/quadtree')
const { throttle, isEqual }                   = require('lodash')
const { genId, isElementANavElement }         = require('./js/utils')
const { markNavbars, passNavElementOnDwell }  = require('./js/navbar-pattern')
const Config                                  = require('./js/config')

var _browser_zoomLevel = 0
var _browser_maxZoom = 9
var _browser_minZoom = -8

ipcRenderer.on('zoomIn', () => {
  if (_browser_maxZoom > _browser_zoomLevel) {
    _browser_zoomLevel += 0.75
  }
  webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomOut', () => {
  if (_browser_minZoom < _browser_zoomLevel) {
    _browser_zoomLevel -= 0.75
  }
  webFrame.setZoomLevel(_browser_zoomLevel)
})

ipcRenderer.on('zoomReset', () => {
  _browser_zoomLevel = 0
  webFrame.setZoomLevel(_browser_zoomLevel)
})

var c
let qTree
let boundary
let linkBounds
let links = []
let linksVisited = []

document.addEventListener('DOMContentLoaded', () => {

  // Instantiate Cursor
  createCursor('cursor')
  c = document.getElementById('cursor')
  // c.style['border-color'] = 'red'
  // c.style['border-left'] = `${Config.rangeWidth/2}px`
  // c.style['border-right'] = `${Config.rangeWidth/2}px`
  // c.style['border-top'] = `${Config.rangeHeight/2}px`
  // c.style['border-bottom'] = `${Config.rangeHeight/2}px`
  // c.style['border-style'] = 'solid'
  followCursor('cursor')

  document.addEventListener('mouseout', () => {
    c.style.visibility = 'hidden'
  })

  document.addEventListener('mouseover', () => {
    c.style.visibility = 'visible'
  })
  
  if (!window.scrollUp) {
    ipcRenderer.send('hideScrollUp')
  }

  document.addEventListener('scroll', () => {
    if (!window.scrollY) {
      ipcRenderer.send('hideScrollUp')
    } else {
      ipcRenderer.send('showScrollUp')
      // ipcRenderer.send('showScrollDown')
    }
  })

  instantiateQuadTree()
  markLinks()
  populateQuadTree()

  var getLinksFromCursorRange =  throttle(() => {
    let cursorLoc = c.getBoundingClientRect()
    getLinksFromQuadTree(cursorLoc)
  }, Config.dwellTime, { 'leading': false })

  document.addEventListener('mousemove', getLinksFromCursorRange)

  document.addEventListener('mouseleave', () => {
    document.removeEventListener('mousemove', getLinksFromCursorRange)
    getLinksFromCursorRange.cancel()
  })

  document.addEventListener('mouseenter', () => {
    document.addEventListener('mousemove', getLinksFromCursorRange)
  })

  // ---------- END HYPERLINK NAVIGATION PATTERN

  //  NAVIGATION BAR INTERACTION PATTERN

  let navElements = markNavbars()
  if (navElements) {
    for (var i=0; i < navElements.length; i++) {
      (function(i) {
        navElements[i].addEventListener('mouseover', passNavElementOnDwell)
      })(i)
    }
  }

  // ---------- END NAVBAR NAVIGATION PATTERN
})

function instantiateQuadTree() {
  // Instantiate Quad Tree
  let clientHeight = Math.max(
    document.body.scrollHeight, document.documentElement.scrollHeight,
    document.body.offsetHeight, document.documentElement.offsetHeight,
    document.body.clientHeight, document.documentElement.clientHeight
  )

  let clientWidth = document.documentElement.clientWidth
  // let clientHeight = document.documentElement.scrollHeight
  boundary = new Rectangle(clientWidth/2, clientHeight/2, clientWidth, clientHeight)
  qTree = new QuadTree(boundary, 1)
}

function markLinks() {
 // Populate Quad Tree
 let anchors = document.getElementsByTagName('a')
 for (var i = 0; i < anchors.length; i++) {
   // Filtering through unneeded links
   if (isElementANavElement(anchors[i])) {
     continue
   }

   linkBounds = anchors[i].getBoundingClientRect()
   if (linkBounds.x === 0 && linkBounds.y === 0 && linkBounds.width === 0 && linkBounds.height === 0) {
     continue
   }

   if (!anchors[i].href ) {
     continue
   }

  //  var text = anchors[i].text.concat(anchors[i].title)
  //  if (!text.match(/[a-z]/i)) {
  //    continue
  //  }

   anchors[i].classList.add('linkMark')
   anchors[i].id = genId()
   links.push(anchors[i])
  }
}

function populateQuadTree() {
  for (var i = 0; i < links.length; i++) {
    const linkTitle = links[i].title ? links[i].title : links[i].text.trim()
    linkBounds = links[i].getBoundingClientRect()

    let link = new Link(
      linkBounds.x,
      linkBounds.y,
      linkBounds.top,
      linkBounds.left,
      linkBounds.bottom,
      linkBounds.right,
      linkBounds.width,
      linkBounds.height,
      linkBounds.x + linkBounds.width/2,
      linkBounds.y + linkBounds.height/2,
      links[i].href,
      linkTitle,
      links[i].id
    )
    qTree.insert(link)
  }
}

// Get Links which fall within the cursor's range from Quad Tree
function getLinksFromQuadTree(cursorLocation) {
  let posX = window.scrollX + cursorLocation.x
  let posY = window.scrollY + cursorLocation.y
  let range = new Rectangle(posX, posY, Config.rangeWidth, Config.rangeHeight)
  let points = qTree.query(range)

  if (Array.isArray(points) && points.length) {
    if (!isEqual(points, linksVisited)) {

      if (linksVisited.length) {
        for (let i=0; i < linksVisited.length; i++) {
          document.getElementById(linksVisited[i]).classList.remove('linkVisualise')
        }
        linksVisited = []
      }

      for (let i=0; i < points.length; i++) {
        document.getElementById(points[i].id).classList.add('linkVisualise')
        linksVisited.push(points[i].id)
      }
    }
    ipcRenderer.send('getLinks', points)
  }
}
