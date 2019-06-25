var gulp 		 = require('gulp'),
	gutil 		 = require('gulp-util'),
	//images
	tinypng		 = require('gulp-tinypng'),					//Сжимает img
	imagemin	 = require('gulp-imagemin'),
	imageminMozjpeg	 = require('imagemin-mozjpeg'),
	imageminGuetzli	 = require('imagemin-guetzli'),
	jimp 		 = require('gulp-jimp'),					//Resize img
	sizeOf 		 = require('image-size'),					//Размер изображения

	//Файлы
	rename 		 = require('gulp-rename'),					//Переименовывает файл Gulp
	renameFiles  = require('rename-files-b'),				//Переименовывает файл
	del 		 = require('del'),							//Удаляет
	ftp          = require('vinyl-ftp'),					//FTP
	zip 		 = require('gulp-vinyl-zip'),				//Zip-архивы
	replace 	 = require('gulp-replace'),					//Поиск и замена
	waitFor 	 = require('gulp-waitfor'),					//Ждет =)
	request 	 = require('request'),
	newer 		 = require('gulp-newer'),					//Убирает дубли
	//Обработка ошибок
	notify 		 = require('gulp-notify'),					//Обработка ошибок
	plumber 	 = require('gulp-plumber'), 				//Обработка ошибок
	combiner 	 = require('stream-combiner2').obj;			//Объединение .pipe

//gulp - Запуск вотчера
//gulp all - Полный цикл
//gulp basesite - Комплит настроек

// SETTING ////////////////////////////////////////////////////////
gulp.task('default', ['all']);			//Default
//gulp.task('default', ['watch']);			//Default

var conn = ftp.create({							//Конфигурация FTP
		host:     '',
		user:     '',
		password: '',
		parallel: 5,
		maxConnections: 10,
		idleTimeout: 3000,
		secureOptions: { rejectUnauthorized: false },
		log: gutil.log
	}),
	patch = '/public_html',			//Папка на сервере
	TINY_API_KEY = '',				//API KEY для tinypng

	hostimg 	 = 'upload',				//Папка с фото для сжатия
	hostimagemin = '/imagemin',				//Папка c imagemin
	siteurl		 = 'https://YOUSITE/imagemin/imagemin.php',

	//Качество сжатия
		qualityGuetzli = 94, //94 
    	qualityimagemin = 89, //89 

		sizecompress = 20,		//Минимальная степень сжатия % (~20 - для png, ~10 - для jpg)
	
	newData;

		gulp.task('_del', function () {		//Удаляет img-new
			return del(['dist','_img-no-minify']);
		});

		gulp.task('_clearimg', function () { //Удаляет img
			return del('_img/*','_imgrepeat');
		});


// BASESITE ///////////////////////////////////////////////////////

gulp.task('basesite', function () {			//Перенос файлов на сервер
	return combiner(
		gulp.src('src/**/*'),
		conn.dest(patch+hostimagemin)
	).on('error', notify.onError());
});


// WATCH //////////////////////////////////////////////////////////

gulp.task('watch', function(){	//Watch
	gulp.watch('src/**/*', ['basesite']);
});


// FTP ////////////////////////////////////////////////////////////

		gulp.task('_download', function () {
			return combiner(
				conn.src(patch+hostimagemin+'/newimages.zip'),
				gulp.dest('_zip')
			).on('error', notify.onError());
		});
		
gulp.task('load', ['_download','_clearimg'], function () {
	return combiner(
		zip.src('_zip/newimages.zip'),
		gulp.dest('_img/')
	).on('error', notify.onError());
});

// IMAGEMIN ///////////////////////////////////////////////////////

								gulp.task('_imageminpng', /*['_del','load'],*/ function () {	//Сжатие изображений png
									return gulp.src('_img/**/*.png')
										.pipe(newer('_middle'))
										.pipe(tinypng(TINY_API_KEY))
										.pipe(gulp.dest('_middle'));
								});

							gulp.task('_imagemin', ['_imageminpng'], function () {	//Сжатие изображений jpg
								return gulp.src('_img/**/*.jpg')
									.pipe(newer('_middle'))
									.pipe(plumber())
									.pipe(imagemin([ imageminGuetzli({ quality: qualityGuetzli })]))
									.pipe(imagemin([ 
										imageminMozjpeg({ 
											progressive: false,
											quality: qualityimagemin
										})
									]))
									.pipe(gulp.dest(function(file) {
										var filename=file.history[0];
										console.log('Guetzli: '+filename.substring(filename.lastIndexOf("\\")+1)+' (done)');
										return '_middle';
									}));
							});

						gulp.task('_jimp', ['_imagemin'], function () {
							return gulp.src('_img/**/*.jpg')
								.pipe(newer('_middle'))
								.pipe(jimp({'': { invert: true }}))
								.pipe(jimp({'': { invert: true }}))
								.pipe(plumber())
								.pipe(imagemin([ imageminGuetzli({ quality: qualityGuetzli })]))
								.pipe(imagemin([ 
									imageminMozjpeg({ 
										progressive: false,
										quality: qualityimagemin
									})
								]))
								.pipe(gulp.dest(function(file) {
									var filename=file.history[0];
									console.log('Guetzli: '+filename.substring(filename.lastIndexOf("\\")+1)+' (done)');
									return '_middle';
								}));
						});

					gulp.task('_ifnomin', ['_jimp'], function () {
						return combiner(
							gulp.src('_img/**/*'),
							newer('_middle'),
							gulp.dest('_img-min-ERROR')
						).on('error', notify.onError());
					});

					var massive_files = new Array(),
						massive_sizes = new Array();

				gulp.task('_precontrole', ['_ifnomin'], function () {
					massive_files = new Array();
					massive_sizes = new Array();

					return gulp.src('_img/**/*.{jpg,png}')
						.pipe(gulp.dest(function(file) {
							var filename=file.history[0];
							massive_files.push(filename.substring(filename.indexOf("\\_img\\")+6)); //Файл
							massive_sizes.push(file.stat.size); //Размер
							return '_img-del';
						}));
				});

			gulp.task('_controle', ['_precontrole'], function () {
				return gulp.src('_middle/**/*.{jpg,png}')
					.pipe(gulp.dest(function(file) {
						var filename=file.history[0],
							massive_id = massive_files.indexOf(filename.substring(filename.indexOf("\\_middle\\")+9)),
							stop = massive_id<0;	//Если картинка отсутствует

						if (stop){
							console.log('НЕ НАЙДЕН В ИСХОДНОМ: '+filename);
						}else{
							var sizeNow = 100 - Math.floor(file.stat.size * 100 / massive_sizes[massive_id]);
							if (sizeNow < sizecompress){ 	//Слабо сжато (разница в %)
								console.log('СЛАБО СЖАТ: '+sizeNow+'% '+filename);
								stop = true;
							}else{
								console.log(filename.substring(filename.lastIndexOf("\\")+1)+' сжат на '+sizeNow+'%');
							}
						}

						if (stop){	//Если минифицированное изображение не подошло
							return '_img-no-minify';
						}else{
							return 'dist';
						}
					}));
			});



// SAVE ///////////////////////////////////////////////////////////

			gulp.task('_save', ['_controle'], function () {		//Перед загрузкой изображений на сервер
				return combiner(
						gulp.src(['dist/'+hostimg+'/**/*']),
						conn.dest(patch+'/'+hostimg)
					).on('error', notify.onError());
			});

		gulp.task('_update', ['_save'], function () {	//Сохраняем оригиналы изображений на хостинге
			return combiner(
					gulp.src('_img/**/*.{jpg,png}'),
					newer('_img-no-minify'),
					conn.dest(patch+'/'+hostimagemin)
				).on('error', notify.onError());			
		});

		gulp.task('_time', function () {
			var u = combiner(
					gulp.src('src/settings.php'),
					replace(/(.|\n)*/, "<?php\n$settings['time'] = '"+newData+"';\n$settings['go'] = '1';"),   //Заменяет содержимое файла
					gulp.dest('src')
				).on('error', notify.onError());
			var d = del(['_middle','_zip','_img-del']);
			return u,d;
		});

gulp.task('save', ['_update'], function () {		//Загружаем изображения на сервер
	return gulp.src('')
		.pipe(waitFor(function(cb) {
			request(siteurl+'?imgminend='+hostimg, function (error, response, body) {
				if (!error && response.statusCode === 200) {
					data = JSON.parse(body);
					if (data.go && data.go == '2'){
						console.log('Сжатие завершено! Сжато '+data.count+' изображений.');
						newData = data.data;	
						gulp.start('_time');			
					}else{
						console.log(data.data);
					}
				}
				cb(true);
			});
		}));
});


// ALL ////////////////////////////////////////////////////////////

gulp.task('all', function () {	//Запускаем поиск и архивацию изображений на сервере
	return gulp.src('')
		.pipe(waitFor(function(cb) {
			request(siteurl+'?imgminstart='+hostimg, function (error, response, body) {
				if (!error && response.statusCode === 200) {
					data = JSON.parse(body);
					if (data.go && data.go == '1'){
						console.log('Количество изображений: '+data.data);
						gulp.start('save');
					}else{
						console.log(data.data);
					}
				}
				cb(true);
			});
		}));
});