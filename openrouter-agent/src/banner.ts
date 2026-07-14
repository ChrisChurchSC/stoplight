const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';

// ASCII logo for HYPER. Block-letter (ANSI Shadow) style, fits within 60 columns.
// This art is editable: swap in your own block lettering here to rebrand the banner.
const LOGO = `
  ██╗  ██╗ ██╗   ██╗ ██████╗  ███████╗ ██████╗
  ██║  ██║ ╚██╗ ██╔╝ ██╔══██╗ ██╔════╝ ██╔══██╗
  ███████║  ╚████╔╝  ██████╔╝ █████╗   ██████╔╝
  ██╔══██║   ╚██╔╝   ██╔═══╝  ██╔══╝   ██╔══██╗
  ██║  ██║    ██║    ██║      ███████╗ ██║  ██║
  ╚═╝  ╚═╝    ╚═╝    ╚═╝      ╚══════╝ ╚═╝  ╚═╝`;

export function printBanner(model: string): void {
  console.log(CYAN + BOLD + LOGO + RESET);
  console.log(`\n  ${DIM}model  ${RESET}${model}\n`);
}
