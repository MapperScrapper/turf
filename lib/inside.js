// http://en.wikipedia.org/wiki/Even%E2%80%93odd_rule

module.exports = function(point, polygon, done){
  //console.log(JSON.stringify(polygon))
  var polyLength = polygon.geometry.coordinates[0].length
  //console.log(polyLength.geometry)
  var x = point.geometry.coordinates[0]
  var y = point.geometry.coordinates[1]
  var i = 0
  var j = polyLength - 1
  var isInside = false
  for (var i=0;i<polyLength;i++){
    console.log('checking')
    console.log(polyLength)
    console.log((((polygon.geometry.coordinates[0][i][1] > y) != (polygon.geometry.coordinates[0][j][1] > y)) && 
       (x < (polygon.geometry.coordinates[0][j][0] - polygon.geometry.coordinates[0][i][0]) * 
        (y - polygon.geometry.coordinates[0][i][1]) / (polygon.geometry.coordinates[0][j][1] - 
          polygon.geometry.coordinates[0][i][1]) + polygon.geometry.coordinates[0][i][0])))
    if(((polygon.geometry.coordinates[0][i][1] > y) != (polygon.geometry.coordinates[0][j][1] > y)) && 
       (x < (polygon.geometry.coordinates[0][j][0] - polygon.geometry.coordinates[0][i][0]) * 
        (y - polygon.geometry.coordinates[0][i][1]) / (polygon.geometry.coordinates[0][j][1] - 
          polygon.geometry.coordinates[0][i][1]) + polygon.geometry.coordinates[0][i][0])){
      isInside = !isInside
      console.log(isInside)
      j = i
    }
  }
  done(null, isInside)
}
