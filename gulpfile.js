const gulp = require('gulp')
const sass = require('gulp-sass')

gulp.task('mainCss', () => {
  return gulp.src('css/scss/main.scss')
    .pipe(sass({outputStyle: 'compressed'}))
    .pipe(gulp.dest('css/'))
})

gulp.task('webviewCss', () => {
  return gulp.src('css/scss/webview.scss')
    .pipe(sass({outputStyle: 'compressed'}))
    .pipe(gulp.dest('css/'))
})

gulp.task('bookmarksCss', () => {
  return gulp.src('css/scss/bookmarks.scss')
    .pipe(sass({outputStyle: 'compressed'}))
    .pipe(gulp.dest('css/'))
})
