#gulp-rev-qn

```
npm install gulp-rev-qn
const rev = require('gulp-rev-qn');
```

请配合[gulp-qn-upload](https://www.npmjs.com/package/gulp-qn-upload)这个库一起使用
```
const qn = require('gulp-qn-upload);
const qiniu_options = {
  accessKey: '',
  secretKey: '',
  bucket: '',
  origin: 'https://xxx.xxx',
};

gulp.task('publish-css', function () {
  return gulp.src(['./build/js/*.css'])
    .pipe(rev())
    .pipe(gulp.dest('./build/js'))
    .pipe(qn({
      qiniu: qiniu_options,
      prefix: 'css'
    }))
    .pipe(rev.manifest())
    .pipe(gulp.dest('./build/rev/css'));
});
```