const gulp = require('gulp')
const sass = require('gulp-sass')(require('node-sass'));

gulp.task('mainCss', () => {
  return gulp.src('app/src/pages/css/scss/main.scss')
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(gulp.dest('app/src/pages/css/'))
})

gulp.task('webviewCss', () => {
  return gulp.src('app/src/pages/css/scss/webview.scss')
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(gulp.dest('app/src/pages/css/'))
})

gulp.task('bookmarksCss', () => {
  return gulp.src('app/src/pages/css/scss/bookmarks.scss')
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(gulp.dest('app/src/pages/css/'))
})

gulp.task('keyboardCss', () => {
  return gulp.src('app/src/pages/css/scss/keyboard.scss')
    .pipe(sass({ outputStyle: 'compressed' }))
    .pipe(gulp.dest('app/src/pages/css/'))
})
