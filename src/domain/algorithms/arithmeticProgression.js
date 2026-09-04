function nthTerm(firstTerm, commonDifference, n) {
  return firstTerm + (n - 1) * commonDifference;
}
function findPositionForValue(firstTerm, commonDifference, targetValue) {
    const n = (targetValue - firstTerm) / commonDifference + 1;
    return n ;
}
module.exports = { nthTerm, findPositionForValue };
