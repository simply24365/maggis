npx tsx ./script/cli.ts make mask-texture `
  --polygon-path ./data/polygon.raw `
  --output-dir ./output/mask `
  --size 512


npx tsx ./script/cli.ts make velocity-texture-all-time `
--polygon-path ./data/polygon.raw `
--dir ./data/20240802 `
--output-dir ./output/velocity `
--size 1024


npx tsx ./script/cli.ts test-read-velocity `
  --dir ./output/velocity `
  --t 1

