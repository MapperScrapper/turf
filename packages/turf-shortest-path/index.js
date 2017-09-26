var bbox = require('@turf/bbox');
var scale = require('@turf/transform-scale');
var inside = require('@turf/inside');
var helpers = require('@turf/helpers');
var distance = require('@turf/distance');
var invariant = require('@turf/invariant');
var cleanCoords = require('@turf/clean-coords');
var bboxPolygon = require('@turf/bbox-polygon');
var point = helpers.point;
// var getType = invariant.getType;
var isNumber = helpers.isNumber;
var getCoord = invariant.getCoord;
var lineString = helpers.lineString;

var jsastar = require('javascript-astar');
var Graph = jsastar.Graph;
var astar = jsastar.astar;

// var aStar = require('astar-andrea');

/**
 * Returns the shortest {@link LineString|path} from {@link Point|start} to {@link Point|end} without colliding with
 * any {@link Feature} in {@link FeatureCollection<Polygon>| obstacles}
 *
 * @name shortestPath
 * @param {Geometry|Feature<Point>} start point
 * @param {Geometry|Feature<Point>} end point
 * @param {GeometryCollection|FeatureCollection<Polygon>} obstacles polygons
 * @param {Object} [options={}] optional parameters
 * @param {string} [options.units="kilometers"] unit in which resolution will be expressed in; it can be degrees, radians, miles, kilometers, ...
 * @param {number} [options.resolution=100] distance between matrix points on which the path will be calculated
 * @returns {Feature<LineString>} shortest path between start and end
 * @example
 * var start = turf.point([-5, -6]);
 * var end = turf.point([9, -6]);
 * var obstacles = turf.featureCollection([turf.polygon([[0,-7],[5,-7],[5,-3],[0,-3],[0,-7]]));
 *
 * var path = shortestPath(start, end, obstacles);
 *
 * //addToMap
 * var addToMap = [start, end, obstacles, path];
 */
module.exports = function (start, end, obstacles, options) {
    // validation
    if (getType(start, 'start') !== 'Point') throw new Error('start must be Point');
    if (getType(end, 'end') !== 'Point') throw new Error('end must be Point');
    if (obstacles && getType(obstacles) !== 'FeatureCollection') throw new Error('obstacles must be FeatureCollection');

    // no obstacles
    if (!obstacles || obstacles.features.length === 0) return lineString([getCoord(start), getCoord(end)]);

    options = options || {};
    var units = options.units || 'kilometers';
    var resolution = options.resolution;
    if (resolution && !isNumber(resolution) || resolution <= 0) throw new Error('resolution must be a number, greater than 0');

    // define path grid area
    var collection = obstacles;
    collection.features.push(start);
    collection.features.push(end);
    var box = bbox(scale(bboxPolygon(bbox(collection)), 1.15)); // extend 15%
    if (!resolution) {
        var width = distance([box[0], box[1]], [box[2], box[1]], units);
        resolution = width / 100;
    }
    collection.features.pop();
    collection.features.pop();

    var west = box[0];
    var south = box[1];
    var east = box[2];
    var north = box[3];

    var xFraction = resolution / (distance(point([west, south]), point([east, south]), units));
    var cellWidth = xFraction * (east - west);
    var yFraction = resolution / (distance(point([west, south]), point([west, north]), units));
    var cellHeight = yFraction * (north - south);

    var bboxHorizontalSide = (east - west);
    var bboxVerticalSide = (north - south);
    var columns = Math.floor(bboxHorizontalSide / cellWidth);
    var rows = Math.floor(bboxVerticalSide / cellHeight);
    // adjust origin of the grid
    var deltaX = (bboxHorizontalSide - columns * cellWidth) / 2;
    var deltaY = (bboxVerticalSide - rows * cellHeight) / 2;

    // loop through points only once to speed up process
    // define matrix grid for A-star algorithm
    var pointMatrix = [];
    var matrix = [];

    var closestToStart = [];
    var closestToEnd = [];
    var minDistStart = Infinity;
    var minDistEnd = Infinity;
    var currentY = north - deltaY;
    var r = 0;
    while (currentY >= south) {
        // var currentY = south + deltaY;
        var matrixRow = [];
        var pointMatrixRow = [];
        var currentX = west + deltaX;
        var c = 0;
        while (currentX <= east) {
            var pt = point([currentX, currentY]);
            var isInsideObstacle = isInside(pt, obstacles);
            // feed obstacles matrix
            matrixRow.push(isInsideObstacle ? 0 : 1); // with javascript-astar
            // matrixRow.push(isInsideObstacle ? 1 : 0); // with astar-andrea
            // map point's coords
            pointMatrixRow.push(currentX + '|' + currentY);
            // set closest points
            var distStart = distance(pt, start);
            // if (distStart < minDistStart) {
            if (!isInsideObstacle && distStart < minDistStart) {
                minDistStart = distStart;
                closestToStart = {x: c, y: r};
            }
            var distEnd = distance(pt, end);
            // if (distEnd < minDistEnd) {
            if (!isInsideObstacle && distEnd < minDistEnd) {
                minDistEnd = distEnd;
                closestToEnd = {x: c, y: r};
            }
            currentX += cellWidth;
            c++;
        }
        matrix.push(matrixRow);
        pointMatrix.push(pointMatrixRow);
        currentY -= cellHeight;
        r++;
    }

    // find path on matrix grid

    // javascript-astar ----------------------
    var graph = new Graph(matrix, {diagonal: true});
    var startOnMatrix = graph.grid[closestToStart.y][closestToStart.x];
    var endOnMatrix = graph.grid[closestToEnd.y][closestToEnd.x];
    var result = astar.search(graph, startOnMatrix, endOnMatrix);

    var path = [start.geometry.coordinates];
    result.forEach(function (coord) {
        var coords = pointMatrix[coord.x][coord.y].split('|');
        path.push([+coords[0], +coords[1]]); // make sure coords are numbers
    });
    path.push(end.geometry.coordinates);
    // ---------------------------------------


    // astar-andrea ------------------------
    // var result = aStar(matrix, [closestToStart.x, closestToStart.y], [closestToEnd.x, closestToEnd.y], 'DiagonalFree');
    // var path = [start.geometry.coordinates];
    // result.forEach(function (coord) {
    //     var coords = pointMatrix[coord[1]][coord[0]].split('|');
    //     path.push([+coords[0], +coords[1]]); // make sure coords are numbers
    // });
    // path.push(end.geometry.coordinates);
    // ---------------------------------------


    return cleanCoords(lineString(path));
};


/**
 * Checks if Point is inside any of the Polygons
 *
 * @private
 * @param {Feature<Point>} pt to check
 * @param {FeatureCollection<Polygon>} polygons features
 * @returns {boolean} if inside or not
 */
function isInside(pt, polygons) {
    for (var i = 0; i < polygons.features.length; i++) {
        if (inside(pt, polygons.features[i])) {
            return true;
        }
    }
    return false;
}

// placeholder for @turf/helpers.getType available in Turf v4.7.4+
function getType(geojson, name) {
    if (!geojson) throw new Error((name || 'geojson') + ' is required');
    // GeoJSON Feature & GeometryCollection
    if (geojson.geometry && geojson.geometry.type) return geojson.geometry.type;
    // GeoJSON Geometry & FeatureCollection
    if (geojson.type) return geojson.type;
    throw new Error((name || 'geojson') + ' is invalid');
}