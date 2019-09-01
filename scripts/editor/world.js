var fs = require('fs-extra');
var Jimp = require("jimp");

function loadScenery() {
    try {
        return JSON.parse(fs.readFileSync("./derived/models.json"));
    } catch (e) {
        console.log('WARNING: Model definitions not found. (' + e + ")");
        return null;
    }
}

const SCENERY = loadScenery();
exports.SCENERY = SCENERY;

// Color map to make more readable image serializations
const COLORS = [
    Jimp.rgbaToInt(0,0,0,0),

    Jimp.rgbaToInt(0,0,0,255),
    Jimp.rgbaToInt(255,255,255,255),

    Jimp.rgbaToInt(255,0,0,255),
    Jimp.rgbaToInt(0,255,0,255),
    Jimp.rgbaToInt(0,0,255,255),

    Jimp.rgbaToInt(255,255,0,255),
    Jimp.rgbaToInt(255,0,255,255),
    Jimp.rgbaToInt(0,255,255,255),

    Jimp.rgbaToInt(255,128,0,255),
    Jimp.rgbaToInt(255,0,128,255),
    Jimp.rgbaToInt(0,255,128,255),
    Jimp.rgbaToInt(128,255,0,255),
    Jimp.rgbaToInt(128,0,255,255),
    Jimp.rgbaToInt(0,128,255,255),

    Jimp.rgbaToInt(255,128,128,255),
    Jimp.rgbaToInt(128,255,128,255),
    Jimp.rgbaToInt(128,128,255,255),
];

const PREFIXES = ["tree", "rock", "fish", "plant"];

var DEBUG = 0; // 0 = none, 1 = some, 2 = more
const wSIZE = 128;
exports.wSIZE = wSIZE;

class World {
    constructor(params) {
        this.params = params;

        if (params.debug) DEBUG = params.debug;

        this.layer = params.layer;
        this.MIN_MX = params.MIN_MX;
        this.MIN_MY = params.MIN_MY;
        this.MAX_MX = params.MAX_MX;
        this.MAX_MY = params.MAX_MY;

        this.MIN_X = this.MIN_MX * wSIZE;
        this.MIN_Y = this.MIN_MY * wSIZE;
        this.MAX_X = (this.MAX_MX + 1) * wSIZE - 1;
        this.MAX_Y = (this.MAX_MY + 1) * wSIZE - 1;

        this.tiles = {};
        this.objects = {};

        this.effects = {};
        this.uniques = {};
        this.npcSpawners = {};
        this.itemSpawners = {};
    }

    modifyTile(source, k, t) {
        this.tiles[k] = t;
    }

    addObject(source, k, t) {
        this.objects[k] = t;
    }

    addObjectAtPosition(source, x, y, id, data) {
        let oo = {
            object: id,
            gx: x,
            gy: y,
            x: x % wSIZE,
            y: y % wSIZE
        }

        this.addObject(source, KEY(x,y), Object.assign(oo, data));
    }

    tile(x,y) {
        if (!this.tiles[KEY(x,y)]) this.tiles[KEY(x,y)] = {};
        let t = this.tiles[KEY(x,y)];
        if (!t.mesh) t.mesh = {};
        if (!t.world) t.world = {};
        return t;
    }

    object(x,y) {
        return this.objects[KEY(x,y)];
    }

    forEachTile(T) {
        for (let x = this.MIN_X; x <= this.MAX_X; x++) {
            for (let y = this.MIN_Y; y <= this.MAX_Y; y++) {
                let t = this.tile(x,y);
                if (t) T(x,y,t);
            }
        }
    }
    
    forEachObject(F) {
        for (let x = this.MIN_X; x <= this.MAX_X; x++) {
            for (let y = this.MIN_Y; y <= this.MAX_Y; y++) {
                let o = this.object(x,y);
                let t = this.tile(x,y);
                if (t && o) F(x,y,o,t);
            }
        }
    }
    
    callForTile(x, y, c) {
        let t = this.tile(x,y);
        if (t) c(t);
    }

    meta() {
        return {
            wSize: wSIZE,
            minMX: this.MIN_MX,
            minX: this.MIN_X,
            minMY: this.MIN_MY,
            minY: this.MIN_Y,
            maxMX: this.MAX_MX,
            maxX: this.MAX_X,
            maxMY: this.MAX_MY,
            maxY: this.MAX_Y        
        }
    }
}

exports.removeObjects = (world, f) => {
    let toRemove = [];
    for (let i in world.objects) {
        if (f(world.objects[i])) toRemove.push(i);
    }

    if (DEBUG > 1) console.log("Deleting " + toRemove.length + " objects.");

    for (let j in toRemove) {
        delete world.objects[toRemove[j]];
    }
}

exports.convertToImage = (world, params) => {
    let scale = params.scale || 1;
    let w = scale * (world.MAX_X - world.MIN_X + 1);
    let h = scale * (world.MAX_Y - world.MIN_Y + 1);

    if (DEBUG > 1) console.log("Writing to " + params.filename);

    let img = new Jimp(w,h);
    let empty = true;
    for (let x = world.MIN_X; x <= world.MAX_X; x++) {
        for (let y = world.MIN_Y; y <= world.MAX_Y; y++) {
            let colors = params.f(x,y);
            
            let lx = (x - world.MIN_X) * scale;
            let ly = (y - world.MIN_Y) * scale;

            for (let xx = 0; xx < scale; xx++)
            for (let yy = 0; yy < scale; yy++) {
                let color = Array.isArray(colors) ? colors[yy * scale + xx] : colors;
                if (empty && Jimp.intToRGBA(color).a > 0) empty = false;

                img.setPixelColor(
                    color,
                    lx + xx, ly + yy);
            }
        }
    }
    if (!empty) img.write(params.filename);
}

async function processFile(world, params, filename, perTile) {
    if (fs.existsSync(filename)) {
        if (DEBUG > 1) console.log("Loading image " + filename);

        let buffer = fs.readFileSync(filename);
        let image = await new Jimp(buffer, (err, image) => {});

        let MIN_X = params.hasOwnProperty('min_x') ? params.min_x : world.MIN_X;
        let MIN_Y = params.hasOwnProperty('min_y') ? params.min_y : world.MIN_Y;
        let MAX_X = params.hasOwnProperty('max_x') ? params.max_x : world.MAX_X;
        let MAX_Y = params.hasOwnProperty('max_y') ? params.max_y : world.MAX_Y;
        
        let xs = Math.floor(image.bitmap.width / (MAX_X - MIN_X));
        let ys = Math.floor(image.bitmap.height / (MAX_Y - MIN_Y));

        if (xs != ys) throw "Scale invalid for " + filename + ":" + xs + ","+ys;
        let scale = xs;

        for (let x = MIN_X; x <= MAX_X; x++) {
            for (let y = MIN_Y; y <= MAX_Y; y++) {
                let colors = Array(scale * scale).fill(COLORS[0]);
                let lx = (x - MIN_X) * scale;
                let ly = (y - MIN_Y) * scale;

                for (let xx = 0; xx < scale; xx++)
                for (let yy = 0; yy < scale; yy++) {
                    colors[yy * scale + xx] = Jimp.intToRGBA(image.getPixelColor(lx + xx, ly + yy));
                }

                perTile(x,y,colors);
            }
        }
    }
}

function tileColor(world) {
    return (x,y) => {
        let tile = world.tile(x,y);
        return Jimp.rgbaToInt(tile.mesh.color.r,tile.mesh.color.g,tile.mesh.color.b,255)
    }
}

function tileSecondary(world) {
    return (x,y) => {
        let tile = world.tile(x,y);

        let colors = Array(9).fill(COLORS[0]);
        
        if (tile.mesh.draw == 'explicit') {
            colors[4] = COLORS[3];
        }

        return colors;
    }
}

function tileHeight(world) {
    return (x,y) => {
        let tile = world.tile(x,y);
        let c = Math.round(255 * tile.mesh.elevation / 20.0);
        return Jimp.rgbaToInt(c,c,c,255)
    };
}

function tileWalkability(world) {
    return (x,y) => {
        let tile = world.tile(x,y);
        let c = tile.collisions;

        let array = Array(4).fill(COLORS[0]);

        // diagonal movement is complicated.
        let N = world.tile(x,y-1);
        let W = world.tile(x-1,y);
        let NW = world.tile(x-1,y-1);

        let allowDiagonal = true;

        // walkability of tiles blocks diagonal movement
        // *unless* the tile is only unwalkable because of a diagonal wall placed there.
        if (N.collisions && !N.collisions.walkable && !N.collisions.walls.diaga) allowDiagonal = false;
        if (W.collisions && !W.collisions.walkable && !W.collisions.walls.diaga) allowDiagonal = false;
        if (NW.collisions && !NW.collisions.walkable && !NW.collisions.walls.diagb) allowDiagonal = false;

        if (W.collisions && W.collisions.walls.N) allowDiagonal = false;
        if (N.collisions && N.collisions.walls.W) allowDiagonal = false;

        if (!c.walkable && !c.walls.diagb) allowDiagonal = false;
        if (c.walls.N) allowDiagonal = false;
        if (c.walls.W) allowDiagonal = false;

        if (allowDiagonal) {
            array[0] = Jimp.rgbaToInt(0,255,0,255);
        } else {
            array[0] = Jimp.rgbaToInt(255,0,0,255);
        }

        if (c.walls.N) {
            if (c.walls.N === true) {
                array[1] = Jimp.rgbaToInt(255,0,0,255);
            } else {
                array[1] = Jimp.rgbaToInt(255,128,0,255);
            }
        } else {
            array[1] = Jimp.rgbaToInt(0,255,0,255);
        }

        if (c.walls.W) {
            if (c.walls.W === true) {
                array[2] = Jimp.rgbaToInt(255,0,0,255);
            } else {
                array[2] = Jimp.rgbaToInt(255,128,0,255);
            }
        } else {
            array[2] = Jimp.rgbaToInt(0,255,0,255);
        }

        if (c.walkable) {
            array[3] = Jimp.rgbaToInt(0,255,0,255);
        } else {
            array[3] = Jimp.rgbaToInt(255,0,0,255);
        }

        return array;
    }
}

function initMetadata(container, type) {
    if (container[type]) return;
    container[type] = { maxIndex: 0, types: {}, colors: {} };
}

function colorKey(cc) {
    return cc.r + "," + cc.g + "," + cc.b;
}

function getColorFor(metadata, key) {
    if (metadata.types[key]) return metadata.types[key];

    let i = metadata.maxIndex++;
    if (i > COLORS.length) {
        throw "Ran out of colors to use.";
    }

    let color = COLORS[i];
    metadata.types[key] = color;

    let cc = Jimp.intToRGBA(color);
    metadata.colors[colorKey(cc)] = key;
    return color;
}

function getObjectFile(key) {
    for (let i in PREFIXES) {
        if (key.startsWith(PREFIXES[i])) return PREFIXES[i];
    }
    return "object";
}

function tileTexture(world, metadata) {
    initMetadata(metadata, "texture");
    return (x,y) => {
        let tile = world.tile(x,y);

        if (tile.mesh.texture) {
            return getColorFor(metadata["texture"], tile.mesh.texture);
        }

        return COLORS[0];
    };
}

function tileObject(world, type, metadata) {
    initMetadata(metadata, type);
    return (x,y) => {
        let object = world.object(x,y);
        if (object) {
            let key = object.object;
            if (getObjectFile(key) == type) {
                let colors = Array(9).fill(getColorFor(metadata[type], key));
                let r = object.rotation ? Math.floor(object.rotation / 90) : 0;
                colors[2] = COLORS[r + 1];
                return colors;
            }
        }
        return COLORS[0];
    }
}

function tileRoof(world, level, metadata) {
    initMetadata(metadata, "roofs");
    return (x,y) => {
        let tile = world.tile(x,y);
        if (tile.mesh.buildings && 
            tile.mesh.buildings["level" + level] && 
            tile.mesh.buildings["level" + level].roof) {
            return getColorFor(metadata.roofs, tile.mesh.buildings["level" + level].roof);
        }
        return COLORS[0];
    };
}

function tileWalls(world, level, metadata) {
    initMetadata(metadata, "walls");

    return (x,y) => {
        let tile = world.tile(x,y);
        
        if (tile.mesh.buildings && 
            tile.mesh.buildings["level" + level] && 
            tile.mesh.buildings["level" + level].walls) {
            let colors = Array(9).fill(COLORS[0]);

            for (let i in tile.mesh.buildings["level" + level].walls) {
                let w = tile.mesh.buildings["level" + level].walls[i];
                
                var color = getColorFor(metadata.walls, w.type);
                if (w.position == 'plusx') {
                    colors[0] = color;
                    colors[1] = color;
                    colors[2] = color;
                } else if (w.position == 'plusy') {
                    colors[0] = color;
                    colors[3] = color;
                    colors[6] = color;
                } else if (w.position == 'diaga') {
                    colors[0] = color;
                    colors[4] = color;
                    colors[8] = color;
                } else if (w.position == 'diagb') {
                    colors[2] = color;
                    colors[4] = color;
                    colors[6] = color;
                }
            }

            return colors;
        }

        return COLORS[0];
    }
}

exports.writeAllImages = (world, params) => {
    params = params || {};
    let root = params.root || ("output/" + world.layer + "/");
    let scale = params.scale || 3;
    var metadata = {};

    if (!params.skipColor) {
        exports.convertToImage(world, {
            scale: scale,
            f: tileColor(world),
            filename: root + "color.png",
        })
    }
    if (!params.skipHeight) {
        exports.convertToImage(world, {
            scale: scale,
            f: tileHeight(world),
            filename: root + "height.png",
        })
    }

    if (!params.skipSecondary) {
        exports.convertToImage(world, {
            scale: scale,
            f: tileSecondary(world),
            filename: root + "secondary.png",
        })
    }

    if (!params.skipTexture) {
        exports.convertToImage(world, {
            scale: scale,
            f: tileTexture(world, metadata),
            filename: root + "textures.png",
        })
    }

    if (!params.skipWalkability) {
        exports.convertToImage(world, {
            scale: 2,
            f: tileWalkability(world),
            filename: root + "walkability.png",
        })
    }
        
    if (!params.skipBuildings)
        for (let i = 0; i <= 3; i++) {
            exports.convertToImage(world, {
                scale: scale,
                f: tileWalls(world, i, metadata),
                filename: root + "walls" + i + ".png",
            })
            exports.convertToImage(world, {
                scale: scale,
                f: tileRoof(world, i, metadata),
                filename: root + "roofs" + i + ".png",
            })
        }

    if (!params.skipObjects) {
        for (let i in PREFIXES) {
            if (!params["skip" + PREFIXES[i]])
                exports.convertToImage(world, {
                    scale: scale,
                    f: tileObject(world, PREFIXES[i], metadata),
                    filename: root + PREFIXES[i] + ".png",
                })
        }
        if (!params.skipGenericObjects)
            exports.convertToImage(world, {
                scale: scale,
                f: tileObject(world, "object", metadata),
                filename: root + "object.png",
            })
    }

    fs.writeFileSync(root + "metadata.json", JSON.stringify(metadata, null, 2));
}

function loadWalls(world, metadata, level) {
    return (x,y,colors) => {
        let tile = world.tile(x,y);

        if (colors[1].a != 255 && 
            colors[3].a != 255 && 
            colors[4].a != 255 && 
            colors[8].a != 255) {
            if (tile.mesh.buildings && tile.mesh.buildings["level" + level])
                delete tile.mesh.buildings["level" + level].walls;
            return;
        }

        if (!tile.mesh.buildings) tile.mesh.buildings = {};
        if (!tile.mesh.buildings["level" + level]) tile.mesh.buildings["level" + level] = {};

        let walls = [];

        let px = colors[1].a == 255 ? metadata.walls.colors[colorKey(colors[1])] : undefined;
        let py = colors[3].a == 255 ? metadata.walls.colors[colorKey(colors[3])] : undefined;
        let da = colors[8].a == 255 ? metadata.walls.colors[colorKey(colors[8])] : undefined;
        let db = colors[4].a == 255 ? metadata.walls.colors[colorKey(colors[4])] : undefined;

        if (px) {
            walls.push({ type: px, position: "plusx" });
        }
        if (py) {
            walls.push({ type: py, position: "plusy" });
        }
        if (da) {
            walls.push({ type: da, position: "diaga" });
        }
        if (db && !da) {
            walls.push({ type: db, position: "diagb" });
        }

        tile.mesh.buildings["level" + level].walls = walls;
    };
}

function loadRoofs(world, metadata, level) {
    return (x,y,colors) => {
        let tile = world.tile(x,y);

        if (colors[0].a == 255) {
            let k = colorKey(colors[0]);
            let r = metadata.roofs.colors[k];
            if (r) {
                if (!tile.mesh.buildings) tile.mesh.buildings = {};
                if (!tile.mesh.buildings["level" + level]) tile.mesh.buildings["level" + level] = {};
                tile.mesh.buildings["level" + level].roof = r;
            }
        }
    }
}

function loadObjects(world, metadata, type) {
    return (x,y,colors) => {
        if (colors[0].a != 255) return;

        let k = colorKey(colors[0]);
        let o = metadata[type].colors[k];

        if (o) {
            let oo = {};
            if (colors.length > 2) {
                let rotationKey = Jimp.rgbaToInt(colors[2].r, colors[2].g, colors[2].b, colors[2].a);
                for (let k in COLORS) {
                    if (COLORS[k] == rotationKey) {
                        oo.rotation = 90 * (k - 1);
                        break;
                    }
                }
            }

            world.addObjectAtPosition("loadObjects", x,y, o, oo);
        }
    };
}

exports.replaceWithImages = async (world, params) => {
    params = params || {};
    let root = params.root || ("output/" + world.layer + "/");

    let metadata = JSON.parse(fs.readFileSync(root + "metadata.json"));
    if (!metadata) throw "Missing metadata.json file.";

    //let dir = fs.readdirSync(root);
    if (!params.skipColor)
        processFile(world, params, root + "color.png", (x,y,colors) => {
            let tile = world.tile(x,y);
            tile.mesh.color = colors[0];
        });

    if (!params.skipSecondary)
        processFile(world, params, root + "secondary.png", (x,y,colors) => {
            let tile = world.tile(x,y);

            let draw = 'blend';
            if (colors[4] && colors[4].a == 255 && colors[4].r == 255) {
                draw = 'explicit';
            }

            tile.mesh.draw = draw;
        });

    if (!params.skipTexture && metadata["texture"])
        processFile(world, params, root + "textures.png", (x,y,colors) => {
            if (colors[0].a != 255) return;

            let k = colorKey(colors[0]);
            let o = metadata["texture"].colors[k];
            let tile = world.tile(x,y);
            if (o) {
                tile.mesh.texture = o;
                tile.mesh.draw = 'explicit';
            }
        });

    if (!params.skipWalkability) {
        processFile(world, params, root + "walkability.png", (x,y,colors) => {
            let tile = world.tile(x,y);
            if (colors[0].r == 255) {
                tile.world.walkable = false;
            }
        });
    }

    if (!params.skipHeight)
        processFile(world, params, root + "height.png", (x,y,colors) => {
            let tile = world.tile(x,y);
            tile.mesh.elevation = colors[0].r * 20.0 / 255;
        });

    if (!params.skipBuildings)
        for (let i = 0; i <= 3; i++) {
            if (!params["skipwalls" + i])
                processFile(world, params, root + "walls" + i + ".png", loadWalls(world, metadata, i));
            if (!params["skiproofs" + i])
                processFile(world, params, root + "roofs" + i + ".png", loadRoofs(world, metadata, i));
        }

    if (!params.skipObjects) {
        for (let i in PREFIXES) {
            if (!params["skip" + PREFIXES[i]])
                processFile(world, params, root + PREFIXES[i] + ".png", loadObjects(world, metadata, PREFIXES[i]));
        }
        if (!params.skipGenericObjects)
            processFile(world, params, root + "object.png", loadObjects(world, metadata, "object"));
    }
}

exports.generateShadows = (world) => {
    world.forEachTile((x,y,t) => {
        let object = world.object(x,y);
        if (object) {
            let def = SCENERY[object.object];
            if (def && def.shadow) {
                t.mesh.shadow = true;
                world.callForTile(x+1, y, t => t.mesh.shadow = true);
                world.callForTile(x, y+1, t => t.mesh.shadow = true);
                world.callForTile(x+1, y+1, t => t.mesh.shadow = true);
            }
        }

        if (t.mesh.buildings && t.mesh.buildings.level0 && t.mesh.buildings.level0.walls) {
            for (let w in t.mesh.buildings.level0.walls) {
                let wall = t.mesh.buildings.level0.walls[w];
                if (wall.position == 'plusx') {
                    t.mesh.shadow = true;
                    world.callForTile(x+1, y, t => t.mesh.shadow = true);
                } else if (wall.position == 'plusy') {
                    t.mesh.shadow = true;
                    world.callForTile(x, y + 1, t => t.mesh.shadow = true);
                } else if (wall.position == 'diaga') {
                    t.mesh.orientation = "diaga";
                    world.callForTile(x, y, t => t.mesh.shadow = true);
                    world.callForTile(x+1, y+1, t => t.mesh.shadow = true);
                } else if (wall.position == 'diagb') {
                    world.callForTile(x+1, y, t => t.mesh.shadow = true);
                    world.callForTile(x, y+1, t => t.mesh.shadow = true);
                }
            }
        }
    });
}

exports.generateIndoorMappings = (world) => {
    world.forEachTile((x,y,tile) => {
        if (tile.mesh.buildings) {
            let b = tile.mesh.buildings;
            if (b.level1 && b.level1.roof) {
                tile.world.indoor = true;
            }
            if (b.level2 && b.level2.roof) {
                tile.world.indoor = true;
            }
            if (b.level3 && b.level3.roof) {
                tile.world.indoor = true;
            }
        }
    });
}

exports.generateCollisions = (world) => {
    world.forEachTile((x,y,tile) => {
        let c = {};
        c.walkable = tile.world.walkable || true;
        c.walls = {};
        if (tile.mesh.buildings && tile.mesh.buildings.level0 && tile.mesh.buildings.level0.walls) {
            for (let i in tile.mesh.buildings.level0.walls) {
                let w = tile.mesh.buildings.level0.walls[i];

                // TODO: Use collision property on wall itself
                if (w.type.startsWith('doorframe')) continue;

                if (w.position == 'plusx') {
                    c.walls.N = true;
                } else if (w.position == 'plusy') {
                    c.walls.W = true;
                } else if (w.position == 'diaga') {
                    c.walkable = false;
                    c.walls.diaga = true;
                } else if (w.position == 'diagb') {
                    c.walkable = false;
                    c.walls.diagb = true;
                }
            }
        }

        tile.collisions = c;
    });

    world.forEachObject((x,y,object) => {
        let def = SCENERY[object.object];
        if (def && def.collision && def.collision.walls) {
            if (def.collision.walls == 'door') {
                let r = object.rotation;
                
                let k = KEY(x,y);
                let OPEN = { scenery: k, state: "open" };
                let CLOSED = { scenery: k, state: "default" };
                if (!r) {
                    world.callForTile(x,y, t => t.collisions.walls.N = CLOSED);
                    world.callForTile(x,y, t => t.collisions.walls.W = OPEN);
                } else if (r == 90) {
                    world.callForTile(x,y, t => t.collisions.walls.W = CLOSED);
                    world.callForTile(x,y+1, t => t.collisions.walls.N = OPEN);
                } else if (r == 180) {
                    world.callForTile(x,y+1, t => t.collisions.walls.N = CLOSED);
                    world.callForTile(x+1,y, t => t.collisions.walls.W = OPEN);
                } else if (r == 270) {
                    world.callForTile(x+1,y, t => t.collisions.walls.W = CLOSED);
                    world.callForTile(x,y, t => t.collisions.walls.N = OPEN);
                }
            }
        }

        if (def && def.heightOverride) {
            world.callForTile(x,y, t => t.mesh.tableSurface = N(def.heightOverride) );
        }

        if (def && def.collision && def.collision.tile) {
            if (def.collision.tile == 'free') {
                // keep tile walkable
            } else if (def.collision.tile == '2x2') {
                world.callForTile(x,y, t => t.collisions.walkable = false);
                world.callForTile(x+1,y, t => t.collisions.walkable = false);
                world.callForTile(x,y+1, t => t.collisions.walkable = false);
                world.callForTile(x+1,y+1, t => t.collisions.walkable = false);
            }
        } else {
            world.callForTile(x,y, t => t.collisions.walkable = false);
        }
    });
}

exports.new = (params) => {
    return new World(params);
}

exports.loadMesh = (world, ox, oy, mesh, waterHeight) => {
    // Load mesh
    for (let x = 0; x < wSIZE; x++) { // terrain actually contains 129x129 but the last tile is meant to be overlap
        for (let y = 0; y < wSIZE; y++) {
            let tile = mesh[x][y];

            let k = (x + ox) + "," + (y + oy);

            let t = {};

            t.mesh = {};
            t.world = {};

            if (tile.color) t.mesh.color = Color(tile.color);
            t.mesh.elevation = tile.elevation;
            if (tile.override) t.mesh.override = tile.override;
            if (tile.texture) t.mesh.texture = tile.texture;
            if (tile.draw) t.mesh.draw = tile.draw; else t.mesh.draw = "blend";
            if (tile.orientation) t.mesh.orientation = tile.orientation;

            if (tile.indoor) t.world.indoor = tile.indoor;

            // double tiles
            if (tile.secondary && (tile.secondary.color || tile.secondary.texture)) {
                t.mesh.secondary = {};
                if (tile.secondary.color) t.mesh.secondary.color = Color(tile.secondary.color);
                if (tile.secondary.texture) t.mesh.secondary.texture = tile.secondary.texture;
            } 
            
            if (tile.buildings) {
                t.mesh.buildings = C(tile.buildings);

                if (tile.buildings.level1 && tile.buildings.level1.roof) {
                    t.world.indoor = true;
                }
                if (tile.buildings.level2 && tile.buildings.level2.roof) {
                    t.world.indoor = true;
                }
                if (tile.buildings.level3 && tile.buildings.level3.roof) {
                    t.world.indoor = true;
                }
            }

            if (tile.hasOwnProperty('walkable')) {
                t.world.walkable = tile.walkable;
            } else {
                t.world.walkable = true;
            }

            // water
            if (waterHeight && tile.elevation < waterHeight && !tile.override) {
                t.world.walkable = false;
            }

            world.modifyTile('loadMapFragment', k, t);
        }
    }
}

exports.loadMapFragment = (world, params) => {
    let mx = params.mx, my = params.my;
    let ox = mx * 128, oy = my * 128;
    let mapkey = mx + "_" + my;

    let loaded;
    if (params.loaded) {
        loaded = params.loaded;
    } else {
        let file = params.file || ("maps/" + world.layer + "/" + mapkey + ".json");
        let data = fs.readFileSync(file);
        loaded = JSON.parse(data);
    }

    let waterHeight;
    if (loaded.effects) {
        for (let i in loaded.effects) {
            let e = loaded.effects[i];
            if (e.type == 'water') {
                waterHeight = Number(e.position.y);
            }
        }
    }

    if (!params.skipMesh) {
        exports.loadMesh(world, ox, oy, loaded.mesh, waterHeight);
    }

    if (loaded.uniqueObjects) {
        world.uniques[mapkey] = loaded.uniqueObjects;
    }

    if (loaded.effects) {
        world.effects[mapkey] = loaded.effects;
    }

    if (loaded.objects) {
        for (let i in loaded.objects) {
            world.addObject('loadMapFragment', i, loaded.objects[i]);
        }
    }

    // TODO: Should this actually update the locations.
    // Should these even be loaded from the fragments?
    if (loaded.npcSpawners) {
        world.npcSpawners[mapkey] = loaded.npcSpawners;
    }

    if (loaded.itemSpawners) {
        world.itemSpawners[mapkey] = loaded.itemSpawners;
    }

    if (DEBUG > 2) console.log("Completed loading " + mapkey);
}

exports.loadAllMapFragments = (world) => {
    for (let mx = world.MIN_MX; mx <= world.MAX_MX; mx++) {
        for (let my = world.MIN_MY; my <= world.MAX_MY; my++) {
            exports.loadMapFragment(world, {
                mx: mx, my: my
            });
        }
    }
    
    if (DEBUG > 0) console.log("Completed loading map fragments.")
}

exports.generateMesh = (world, params) => {
    let mx = params.mx, my = params.my;
    let ox = mx * wSIZE, oy = my * wSIZE;
    let mapkey = mx + "_" + my;

    let lmesh = [];

    for (let lx = 0; lx <= wSIZE; lx++) {
        lmesh[lx] = [];
        for (let ly = 0; ly <= wSIZE; ly++) {
            let gx = ox + lx;
            let gy = oy + ly;

            let tile = world.tile(gx, gy);
            if (!tile.draw) tile.draw = 'none';
            lmesh[lx][ly] = tile.mesh;

            if (tile.collisions) {
                lmesh[lx][ly].walkable = tile.collisions.walkable || true;
            }

            if (tile.world) {
                lmesh[lx][ly].indoor = tile.world.indoor;
            }

            // data cleanup
            if (lmesh[lx][ly].elevation) {
                lmesh[lx][ly].elevation = +lmesh[lx][ly].elevation.toFixed(4);
            }
        }
    }

    return lmesh;
}

exports.writeFragment = (world, params) => {
    let mx = params.mx, my = params.my;
    let ox = mx * wSIZE, oy = my * wSIZE;
    let mapkey = mx + "_" + my;

    if (DEBUG > 1) console.log("Writing map file " + mapkey);

    let root = params.root || "output/";

    let lmesh = exports.generateMesh(world, params);

    let lobjects = {};
    for (let lx = 0; lx <= wSIZE; lx++) {
        for (let ly = 0; ly <= wSIZE; ly++) {
            let gx = lx + ox, gy = ly + oy;
            let object = world.object(gx , gy);
            if (object && lx < wSIZE && lx < wSIZE) {
                lobjects[KEY(gx, gy)] = object;
            }
        }
    }

    let map = { mesh: lmesh, objects: lobjects };
    if (world.effects[mapkey]) {
        map.effects = world.effects[mapkey];
    }
    if (world.uniques[mapkey]) {
        map.uniqueObjects = world.uniques[mapkey];
    }
    if (world.npcSpawners[mapkey]) {
        map.npcSpawners = world.npcSpawners[mapkey];
    }
    if (world.itemSpawners[mapkey]) {
        map.itemSpawners = world.itemSpawners[mapkey];
    }

    fs.ensureDirSync(root + world.layer + "/");
    fs.writeFileSync(
        root + world.layer + "/" + mapkey + ".json", 
        JSON.stringify(map, null, 2));
}

exports.writeMapFragments = (world, params) => {
    for (let mx = world.MIN_MX; mx <= world.MAX_MX; mx++) {
        for (let my = world.MIN_MY; my <= world.MAX_MY; my++) {
            exports.writeFragment(world, Object.assign({}, params, {
                mx: mx, my: my
            }));
        }
    }
}

exports.writeServerInfo = (world, params) => {
    params = params || {};
    
    let server = {
        objects: {},
        objectCollisions: {},
        npcSpawners: world.npcSpawners,
        itemSpawners: world.itemSpawners,
    };

    server._meta = world.meta();

    world.forEachObject((x,y,o) => {
        let key = KEY(x,y);
        if (o.rotation == 0) delete o.rotation;
        server.objects[key] = o;
    });

    // Add the 'dynamic collisions' such as doors.
    world.forEachTile((x,y,t) => {
        let key = KEY(x,y);
        let c = t.collisions;
        if (c.walls.N !== true) {
            server.objectCollisions[key + ",N"] = c.walls.N;
        }
        if (c.walls.W !== true) {
            server.objectCollisions[key + ",W"] = c.walls.W;
        }
    })

    let root = params.root || "output/";
    if (DEBUG > 1) console.log("Writing server file " + root + world.layer + ".json");
    fs.writeFileSync(
        root + world.layer + ".json", 
        JSON.stringify(server, null, 2));

    exports.convertToImage(world, {
        scale: 2,
        f: tileWalkability(world),
        filename: root + world.layer + "-walkability.png",
    })
}

/**
 * Utility functions.
 */

// Copies an object.
function C(o) {
    return JSON.parse(JSON.stringify(o));
}

// Generates a color structure.
function Color(o) {
    if (o.r < 0) o.r = 0;
    if (o.g < 0) o.g = 0;
    if (o.b < 0) o.b = 0;
    return C(o);
}

function KEY(x,y) {
    return x + "," + y;
}

function N(x) {
    return Number(x);
}