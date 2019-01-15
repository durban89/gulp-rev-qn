'use strict';
var path = require('path');
var gutil = require('gulp-util');
var through = require('through2');
var objectAssign = require('object-assign');
var file = require('vinyl-file');
var revHash = require('rev-hash');
var revPath = require('rev-path');
var sortKeys = require('sort-keys');
var modifyFilename = require('modify-filename');

function relPath(base, filePath) {
	if (filePath.indexOf(base) !== 0) {
		return filePath.replace(/\\/g, '/');
	}

	var newPath = filePath.substr(base.length).replace(/\\/g, '/');

	if (newPath[0] === '/') {
		return newPath.substr(1);
	}

	return newPath;
}

function getManifestFile(opts, cb) {
	file.read(opts.path, opts, function (err, manifest) {
		if (err) {
			// not found
			if (err.code === 'ENOENT') {
				cb(null, new gutil.File(opts));
			} else {
				cb(err);
			}

			return;
		}

		cb(null, manifest);
	});
}

function transformFilename(file) {
	// save the old path for later
	file.revOrigPath = file.path;
	file.revOrigBase = file.base;
	file.revHash = revHash(file.contents);

	file.path = modifyFilename(file.path, function (filename, extension) {
		var extIndex = filename.indexOf('.');

		filename = extIndex === -1 ?
			revPath(filename, file.revHash) :
			revPath(filename.slice(0, extIndex), file.revHash) + filename.slice(extIndex);

		return filename + extension;
	});
}

var plugin = function () {
	var sourcemaps = [];
	var pathMap = {};

	return through.obj(function (file, enc, cb) {
		if (file.isNull()) {
			cb(null, file);
			return;
		}

		if (file.isStream()) {
			cb(new gutil.PluginError('gulp-rev', 'Streaming not supported'));
			return;
		}

		// this is a sourcemap, hold until the end
		if (path.extname(file.path) === '.map') {
			sourcemaps.push(file);
			cb();
			return;
		}

		var oldPath = file.path;
		transformFilename(file);
		pathMap[oldPath] = file.revHash;

		cb(null, file);
	}, function (cb) {
		sourcemaps.forEach(function (file) {
			var reverseFilename;

			// attempt to parse the sourcemap's JSON to get the reverse filename
			try {
				reverseFilename = JSON.parse(file.contents.toString()).file;
			} catch (err) {}

			if (!reverseFilename) {
				reverseFilename = path.relative(path.dirname(file.path), path.basename(file.path, '.map'));
			}

			if (pathMap[reverseFilename]) {
				// save the old path for later
				file.revOrigPath = file.path;
				file.revOrigBase = file.base;

				var hash = pathMap[reverseFilename];
				file.path = revPath(file.path.replace(/\.map$/, ''), hash) + '.map';
			} else {
				transformFilename(file);
			}

			this.push(file);
		}, this);

		cb();
	});
};

plugin.manifest = function (pth, opts) {
	if (typeof pth === 'string') {
		pth = {path: pth};
	}

	opts = objectAssign({
		path: 'rev-manifest.json',
		merge: false
	}, opts, pth);

	var firstFileBase = null;
	var manifest = {};

	return through.obj(function (file, enc, cb) {
		// ignore all non-rev'd files
		if (!file.path || !file.revOrigPath) {
			cb();
			return;
		}

		firstFileBase = firstFileBase || file.base;

		// file.path 暂时出现了 https://xxx.xxx -> https:/xxx.xxx的情况，从file.path取值的话就会得到这个结果，为了对应需求，做下修复
		// 使用的时候请结合gulp-qn-upload使用
		let revisionedFile = '';
		let revisionedFile1 = '';
		let originalFile = '';
		if (file.websitePath) {
			revisionedFile = relPath(firstFileBase, file.websitePath);
			revisionedFile1 = relPath(path.resolve(file.cwd, file.base), path.resolve(file.cwd, file.path));
			originalFile = path.join(path.dirname(revisionedFile1), path.basename(file.revOrigPath)).replace(/\\/g, '/');
		} else {
			revisionedFile = relPath(path.resolve(file.cwd, file.base), path.resolve(file.cwd, file.path));
			originalFile = path.join(path.dirname(revisionedFile), path.basename(file.revOrigPath)).replace(/\\/g, '/');
		}
		
		manifest[originalFile] = revisionedFile;

		cb();
	}, function (cb) {
		// no need to write a manifest file if there's nothing to manifest
		if (Object.keys(manifest).length === 0) {
			cb();
			return;
		}

		getManifestFile(opts, function (err, manifestFile) {
			if (err) {
				cb(err);
				return;
			}

			if(typeof opts.keyPrefix === 'string' && opts.keyPrefix && manifest){
				var tmpMainFest = {};
				for(let key in manifest){
					tmpMainFest[opts.keyPrefix + '/' + key] = manifest[key];
				}

				manifest = tmpMainFest;
			}
			
			if (opts.merge && !manifestFile.isNull()) {
				var oldManifest = {};

				try {
					oldManifest = JSON.parse(manifestFile.contents.toString());
				} catch (err) {}

				manifest = objectAssign(oldManifest, manifest);
			}

			manifestFile.contents = Buffer.from(JSON.stringify(sortKeys(manifest), null, '  '));
			this.push(manifestFile);
			cb();
		}.bind(this));
	});
};

module.exports = plugin;
