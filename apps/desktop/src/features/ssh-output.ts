type ControlState = 'text' | 'escape' | 'csi' | 'osc' | 'osc-escape';

export function createSshOutputFilter() {
  let state: ControlState = 'text';
  let controlLength = 0;

  return (chunk: string) => {
    let output = '';
    for (const char of chunk) {
      if (state === 'text') {
        if (char === '\x1b') { state = 'escape'; controlLength = 0; }
        else output += char;
        continue;
      }
      controlLength += 1;
      if (controlLength > 4096) { state = 'text'; controlLength = 0; continue; }
      if (state === 'escape') {
        state = char === '[' ? 'csi' : char === ']' ? 'osc' : 'text';
      } else if (state === 'csi') {
        if (char >= '@' && char <= '~') state = 'text';
      } else if (state === 'osc') {
        if (char === '\x07') state = 'text';
        else if (char === '\x1b') state = 'osc-escape';
      } else if (state === 'osc-escape') {
        state = char === '\\' || char === '\x07' ? 'text' : 'osc';
      }
    }
    return output;
  };
}
