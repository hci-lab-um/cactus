const { concat } = require('lodash')
const { dwell } = require('./utils')
const { ipcRenderer } = require('electron')

let navElements = []

function getNavElements() {
  var nav = {
    navTags: Array.from(document.querySelectorAll('nav')),
    navDivs: Array.from(document.querySelectorAll('div[role="navigation"]'))
  }
  return nav 
}

var markNavbars = function() {
  var { navDivs, navTags } = getNavElements()

  if (navDivs && navTags) {
    for (var i = 0; i < navTags.length; i++) {
      // If the nav tag is found in a nav div (parent),
      // remove it so we don't have a double marker
      if (navTags[i].closest('div[role="navigation"]')) {
        navTags.splice(i, 1)
      }
    }
    navElements = concat(navDivs, navTags)
  }

  for (i=0; i < navElements.length; i++) {
    navElements[i].classList.add('navMarker')
  }

  return navElements
}

class navItem {
  constructor(id, title, href, parent, children) {
    this.id = id
    this.title = title
    this.href = href
    this.parent = parent
    this.children = children
  }
}

let navItems = []

let navId = 1;

var buildNavArray = function(element) {
  if (element.tagName) {
    if (element.tagName == "UL" || element.tagName == "OL") {
      let listItemsOfRoot = element.children
      var root = new navItem(navId, "", "", 0, listItemsOfRoot)
      navItems.push(root)

      for (var i=0; i < listItemsOfRoot.length; i++) {
        addItemToNavArray(listItemsOfRoot[i], root.id)
      }
    }
  }
}

function addItemToNavArray(listElement, parentId) {
  let id = ++navId
  let title = " "
  let parent = parentId
  let href = " "

  let anchor = null

  if (listElement.tagName === "UL" || listElement.tagName === "OL") {
    title = listElement.parentElement.textContent.trim().split('\n')[0]
    anchor = listElement.parentElement.querySelector('a')
  } else {
    title = listElement.textContent.trim()
    anchor = listElement.querySelector('a')
  }


  if (anchor) {
    href = anchor.href
  }

  let ulTags = Array.from(listElement.getElementsByTagName('ul')) || Array.from(listElement.getElementsByTagName('ol'))
  if(ulTags.length) {
    if (ulTags.length === 1) {
      let nestedListItems = ulTags[0].children
      for (var j=0; j < nestedListItems.length; j++) {
        addItemToNavArray(nestedListItems[j], id)
      }
    } else {
      for (var i=0; i < ulTags.length; i++) {
        let nestedListItems = ulTags[i].children
        let ulId = addItemToNavArray(ulTags[i], id)
        for (var j=0; j < nestedListItems.length; j++) {
          addItemToNavArray(nestedListItems[j], ulId)
        }
      }
    }
  }

  // Edge cases for hsbc/barclays tests
  title = title.split('menu item level')[0]
  title = title.split('Press enter')[0]

  let n = new navItem(id, title, href, parent)

  if (n.title.trim() || n.href.trim()) {
    navItems.push(n)
  }
  return id
}

function passNavElementOnDwell() {
  dwell(this, () => {
    let parentUlTag = this.getElementsByTagName('ul')[0] || this.getElementsByTagName('ol')[0]
    buildNavArray(parentUlTag)
    // console.log(navItems)
    ipcRenderer.send('getNavLinks', navItems)
  })
}

module.exports = {
  markNavbars,
  passNavElementOnDwell
}
