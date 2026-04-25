export const Style = {
color: 0x1d72d7,

footer: (label) => ({
text: `DHS System | ${label}`,
}),

timestamp: () => ({
text: `DHS System | ${new Date().toUTCString()}`,
}),
};