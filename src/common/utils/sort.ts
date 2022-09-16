

/*
  Binary Search:
  Assumes that @arg array is sorted increasingly
  return largest i such that array[i] <= target; return -1 if array[0] > target || array is empty
*/
export function findLowerBound(target: number, array: number[]) {
    let start = 0;
    let length = array.length;
    while (length > 0) {
        const half = length >> 1;
        const middle = start + half;
        if (array[middle] <= target) {
            length = length - 1 - half;
            start = middle + 1;
        } else {
            length = half;
        }
    }
    return start - 1;
}

/*
  Binary Search:
  Assumes that @arg array is sorted increasingly
  return largest array[i] such that array[i] <= target; return null if array[0] > target || array is empty
*/
export function findLowerBoundValue(target: number, array: number[]) {
    const index = findLowerBound(target, array);
    return index >= 0 ? array[index] : null;
}