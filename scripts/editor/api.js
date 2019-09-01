const fs = require('fs-extra');
const dir = require('../libraries/directory.js');
const world = require('../editor/world.js');

exports.getWorldMetadata = () => {
    let metadata = {};

    let layers = fs.readdirSync('./maps');
    for (let i in layers) {
        let layer = layers[i];
        metadata[layer] = { tiles: {} };
        let maps = fs.readdirSync('./maps/' + layer);

        let min_mx, min_my, max_mx, max_my;
        for (let j in maps) {
            let map = maps[j];
            let [mx,my] = map.split('_');
            mx = Number(mx); my = Number(my);

            if (!metadata[layer].tiles[mx]) metadata[layer].tiles[mx] = {};
            metadata[layer].tiles[mx][my] = true;
    
            if (min_mx === undefined || mx < min_mx) min_mx = mx;
            if (min_my === undefined || my < min_my) min_my = my;
            if (max_mx === undefined || mx > max_mx) max_mx = mx;
            if (max_my === undefined || my > max_my) max_my = my;
        }

        metadata[layer].min_mx = min_mx;
        metadata[layer].min_my = min_my;
        metadata[layer].max_mx = max_mx;
        metadata[layer].max_my = max_my;
    }
    
    return metadata;
}

exports.getWorldInfo = (layer,x,y) => {
    return {
        layer: layer,
        x: x, y: y
    }
}

exports.getWorldMesh = async (layer,mx,my,params) => {
    mx = Number(mx); my = Number(my);
    let worldParams = { 
        layer: layer, 
        MIN_MX: mx, MIN_MY: my, MAX_MX: mx, MAX_MY: my,
        debug: 0
    };
    let W = world.new(worldParams);

    await world.replaceWithImages(W, { 
        root: params.root + layer + '/' + mx + "_" + my + '/mesh/',

        min_x: mx * world.wSIZE,
        min_y: my * world.wSIZE,
        max_x: (mx + 1) * world.wSIZE - 1,
        max_y: (my + 1) * world.wSIZE - 1,

        skipColor: false,
        skipSecondary: false,
        skipHeight: false,
        skipBuildings: false,
        skiptree: true,
        skiprock: true,
        skipfish: true,
        skipplant: true,
        skipGenericObjects: true,
        skipTexture: false,
        skipWalkability: false
    });

    world.generateShadows(W);
    world.generateCollisions(W);

    return world.generateMesh(W, { mx: mx, my: my})
}

exports.getWorldObjects = (layer,x,y,params) => {
    let root = params.root + '/' + layer + '/' + x + '_' + y + '/objects';

    let objects = {};
    dir.traverseSubdirectory([], [], root, (k,v,meta) => {
        let actualKey = v.gx + "," + v.gy;
        objects[actualKey] = v;
    })

    return objects;
}

exports.placeObject = (def) => {
    let o = def.object;
    let layer = def.layer;
    let mx = def.mx;
    let my = def.my;

    let key = def.gx + "," + def.gy + "," + def.object + ".json";
    let type = def.object.split('-')[0];
    let root = './maps/' + layer + '/' + mx + '_' + my + '/objects/' +
               type + '/';
               
    if (fs.existsSync(root + key)) {
        console.log("Object already exists at " + key);
    } else {
        let object = { 
            object: o,
            x: def.x, y: def.y,
            gx: def.gx, gy: def.gy,
        }
        if (def.rotation) object.rotation = def.rotation;

        fs.ensureDirSync(root);
        fs.writeFileSync(root + key, JSON.stringify(object, null, 2));
    }
}