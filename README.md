# Atlas Manager for Peanut

Texture atlas builder and sprite slicer for a 2D PS2-oriented engine called peanut.

## Packing Note

Power-of-two page sizing is relevant for this tool, but tall skinny pages like
`64x512` are usually a packing-strategy artifact, not a direct PlayStation 2 GS
hardware requirement. The atlas packer tries multiple fixed power-of-two
page shapes, scores the results, and prefers fewer pages first, lower waste
second, and more square pages third.
