// Resolves on the next macrotask, through a MessageChannel: unlike setTimeout(0) it is not clamped
// to 1 s in a background tab, and the browser can still render a frame between two tasks. Used by
// the work that is sliced so it never freezes the page (the Dustline Ridge build, its nav grid).
const channel = new MessageChannel()
const queue = []
channel.port1.onmessage = () => queue.shift()?.()
export function nextTask() {
  return new Promise((resolve) => {
    queue.push(resolve)
    channel.port2.postMessage(0)
  })
}

// A slicer: `await slice()` yields once `budget` ms have passed since the last yield.
export function slicer(budget = 10) {
  let t0 = performance.now()
  return async () => {
    if (performance.now() - t0 < budget) return
    await nextTask()
    t0 = performance.now()
  }
}
