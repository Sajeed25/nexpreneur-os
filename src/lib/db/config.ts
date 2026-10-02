/** True once DATABASE_URL points at a real MySQL server (not the deploy placeholder). Kept free of heavy imports so pages that only check this never load the DB driver. */
export const hasDb = () => /^mysql:\/\//.test(process.env.DATABASE_URL ?? "");
