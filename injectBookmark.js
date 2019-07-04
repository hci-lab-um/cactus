const { ipcRenderer }               = require('electron')
const { byId, dwell }               = require('./js/utils')
const { createCursor, followCursor } = require('./js/cursor')

let c

document.addEventListener('DOMContentLoaded', () => {
  createCursor('cursor')
  c = document.getElementById('cursor')
  followCursor('cursor')

  document.addEventListener('mouseout', () => {
    c.style.visibility = 'hidden'
  })

  document.addEventListener('mouseover', () => {
    c.style.visibility = 'visible'
  })
})

ipcRenderer.on('getBookmarks', (event, message) => {
  let bookmarksJson = JSON.parse(message)
  let bookmarksArray = Array.from(bookmarksJson.bookmarks)
  let bookmarkContainer = byId('bookmarksBoxes')

  const markup = `${bookmarksArray.map(bookmark => `
    <div class="bookmarkBox">
      <span class="bookmarkTitle">${bookmark.name}</span>
      <span class="bookmarkLink">${bookmark.url}</span>
    </div>`).join('')}`

  bookmarkContainer.insertAdjacentHTML('beforeend', markup)
  
  let bookmarks = document.getElementsByClassName('bookmarkBox')
  if(bookmarks.length) {
    for (var i = 0; i < bookmarks.length; i++) {
      (function(i) {
        dwell(bookmarks[i], () => {
          ipcRenderer.send('loadBookmark', bookmarks[i].lastElementChild.innerHTML)
        })
      })(i)
    }
  }

  // function loadLink() {
  //   dwell(this, () => {
  //     ipcRenderer.send('loadBookmark', this.lastElementChild.innerHTML)
  //   })
  // }

  let closeBtn = byId('bookmarksClose')
  dwell(closeBtn, () => {
    ipcRenderer.send('closeBookmarks')
  })
})
