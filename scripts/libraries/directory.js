/**
 * The content folders follow a specific format:
 * 
 * <dir>/metadata.json
 * <dir>/subfolder/metadata.json
 * <dir>/subfolder/foo.json
 * 
 * This results in a single record:
 *   key: "subfolder/foo",
 * 
 * The contents of that record should be:
 *   Object.assign(
 *      {}, 
 *      <dir>/metadata.json, 
 *      <dir>/subfolder/metadata.json, 
 *      <dir>/subfolder/foo.json)
 */
var fs = require('fs-extra');
var path = require("path");

function traverseSubdirectory(pathList, metadataList, dir, itemCallback) {
    let metadata = {};
    if (fs.existsSync(dir + "/metadata.json")) {
        metadata = JSON.parse(fs.readFileSync(dir + "/metadata.json"));
    }

    let newMetadataList = [...metadataList, metadata];

    let contents = fs.readdirSync(dir);
    for (let i in contents) {
        let ii = contents[i];
        if (ii == 'metadata.json') continue;

        let file = dir + "/" + ii;
        let stats = fs.statSync(file);

        if (stats.isDirectory()) {
            let newPathList = [...pathList, ii];
            traverseSubdirectory(newPathList, newMetadataList, dir + "/" + ii, itemCallback);
        } else if (stats.isFile() && file.endsWith('.json')) {
            let contents = JSON.parse(fs.readFileSync(dir + "/" + ii));
            let value = Object.assign({}, ...newMetadataList, contents);

            let extension = path.extname(file);
            let base = path.basename(file, extension);

            let key = [...pathList, base].join('-');

            itemCallback(key, value, { filename: file, short: base, directory: dir });
        }
    }
}

function traverseDirectory(dir, callback) {
    let base = {};

    traverseSubdirectory([], [], dir, (key, value) => {
        base[key] = value;
    });

    callback(base);
}

function traverseAndCreateTree(tree, path) {
    for (let i in tree) {
        if (i == '$data') {
            fs.writeFileSync(path + ".json", JSON.stringify(
                tree[i], null, 2
            ));
        } else {
            fs.ensureDirSync(path);
            traverseAndCreateTree(tree[i], path + "/" + i);
        }
    }
}

function createDirectoriesFromFile(file, root) {
    let tree = {};

    // Generate the tree.
    for (let item in file) {
        let keys = item.split('-');
        let value = file[item];

        // create path
        let cur = tree;
        for (let i in keys) {
            let ii = keys[i];
            if (!cur[ii]) cur[ii] = {};
            cur = cur[ii];
        }

        cur["$data"] = value;
    }

    // Create the structure
    traverseAndCreateTree(tree, root);
}

exports.traverseAndCreateTree = traverseAndCreateTree;
exports.createDirectoriesFromFile = createDirectoriesFromFile;
exports.traverseDirectory = traverseDirectory;
exports.traverseSubdirectory = traverseSubdirectory;