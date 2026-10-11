/** Recovered 096D Level-1 native tables. */
export const LEVEL1_RANDOM_SCRIPT_TABLE = [0x24b2, 0x2522, 0x2592, 0x2602, 0x2672, 0x2602, 0x2592, 0x2522] as const;
export const LEVEL1_RANDOM_VELOCITY_X = [0x0080, 0x00c0, 0xff80, 0xff40, 0x0000, 0x0000, 0x00e0, 0xff20] as const;
export const LEVEL1_ACCEL_Y_FROM_BART_DISTANCE = [0x0000, 0x0000, 0x00c0, 0x0090, 0x0060, 0x0058, 0x0040, 0x0040] as const;
export const LEVEL1_SPEECH_BUBBLE_TYPES = new Set<number>([13, 14]);

/** 096D:2009 operand consumed by Level1Native_SetObjectLinkField2A. */
export const LEVEL1_TYPE05_LINK_COUNT = 0x0064;

/** Level-record offset tested by 096D:3179; typeOffset 86h means type 67. */
export const LEVEL1_TYPE67_RECORD_OFFSET = 0x0599;
export const LEVEL1_TYPE67_OFFSET = 0x0086;

/** LevelSpecificPlayer_Level1 (38ECh) skateboard interval and boundary sources. */
export const LEVEL1_SKATEBOARD_MIN_X = 0x0d6c;
export const LEVEL1_SKATEBOARD_MAX_X = 0x2180;
/** Source #53 / #83 offsets inside the Level-1 source list. */
export const LEVEL1_SKATEBOARD_BOUNDARY_LEFT_SOURCE_OFFSET = 0x03ff;
export const LEVEL1_SKATEBOARD_BOUNDARY_RIGHT_SOURCE_OFFSET = 0x052b;
