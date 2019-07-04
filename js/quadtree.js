class Link {
  constructor(x, y, top, left, bottom, right, width, height, centerX, centerY, url, title, id) {
    this.x = x
    this.y = y
    this.top = top
    this.left = left
    this.bottom = bottom
    this.right = right
    this.width = width
    this.height = height
    this.centerX = centerX
    this.centerY = centerY
    this.url = url
    this.title = title
    this.id = id
  }
}

class Rectangle {
  constructor(x, y, width, height) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }

  contains(link) {
    return (link.x > this.x - this.width/2 &&
      link.x < this.x + this.width/2 &&
      link.y > this.y - this.height/2 &&
      link.y < this.y +this.height/2)
  }

  intersects(range) {
    return !(range.x - range.width > this.x + this.width ||
      range.x + range.width < this.x - this.width ||
      range.y - range.height > this.y + this.height ||
      range.y + range.height < this.y - this.height)
  }
}

class QuadTree {
  constructor(boundary, capacity) {
    this.boundary = boundary
    this.capacity = capacity
    this.links = []
    this.divided = false
  }

  subdivide() {
    let x = this.boundary.x
    let y = this.boundary.y
    let w = this.boundary.width
    let h = this.boundary.height

    let ne = new Rectangle(x+w/4, y-h/4, w/2, h/2)
    this.northeast = new QuadTree(ne, this.capacity)
    let nw = new Rectangle(x-w/4, y-h/4, w/2, h/2)
    this.northwest = new QuadTree(nw, this.capacity)
    let se = new Rectangle(x+w/4, y+h/4, w/2, h/2)
    this.southeast = new QuadTree(se, this.capacity)
    let sw = new Rectangle(x-w/4, y+h/4, w/2, h/2)
    this.southwest = new QuadTree(sw, this.capacity)
    this.divided = true
  }

  insert(link) {
    if (!this.boundary.contains(link)) {
      return false
    }

    if (this.links.length < this.capacity) {
      this.links.push(link)
      return true
    } else {
      if (!this.divided) {
        this.subdivide()
        this.divided = true
      }

      if (this.northeast.insert(link)) {
        return true
      } else if (this.northwest.insert(link)) {
        return true
      } else if (this.southeast.insert(link)) {
        return true
      } else if (this.southwest.insert(link)) {
        return true
      }
    }
  }

  query(range, found) {    
    if (!found) {
      found = []
    }

    if (!this.boundary.intersects(range)) {
      return
    } else {
      for (let l of this.links) {
        if (range.contains(l)) {
          found.push(l)
        }
      }

      if (this.divided) {
        this.northwest.query(range, found)
        this.northeast.query(range, found)
        this.southwest.query(range, found)
        this.southeast.query(range, found)
      }
     }
     return found
  }
}

module.exports = {
  Link,
  Rectangle,
  QuadTree 
}
