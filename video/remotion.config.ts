import { Config } from '@remotion/cli/config'

// Make renders deterministic and avoid accidental prompts.
Config.setOverwriteOutput(true)
Config.setVideoImageFormat('png')

