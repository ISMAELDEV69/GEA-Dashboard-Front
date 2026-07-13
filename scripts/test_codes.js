async function run() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR5cIgvA11b8Xczt-fwGREZ9XPWMXxPq5OTpNMXgaiU3jEMWD4FwVjAdFpDX5V3fI5lXEQST8S_vI70/pub?output=csv'
    const res = await fetch(csvUrl)
    const text = await res.text()
    let countEmpty = 0;
    const lines = text.split('\n')
    for(let i=1; i<lines.length; i++) {
        const parts = lines[i].split(',')
        if (parts.length > 3) {
            let code = parts[3].trim()
            if (!code) countEmpty++
        }
    }
    console.log("Empty codes count:", countEmpty)
    console.log("Total lines:", lines.length)
}
run()
