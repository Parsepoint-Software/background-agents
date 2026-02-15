import chalk from "chalk";

export function info(message: string): void {
  console.log(`${chalk.blue("ℹ")} ${message}`);
}

export function success(message: string): void {
  console.log(`${chalk.green("✓")} ${message}`);
}

export function warn(message: string): void {
  console.log(`${chalk.yellow("⚠")} ${message}`);
}

export function error(message: string): void {
  console.log(`${chalk.red("✗")} ${message}`);
}

export function debug(message: string): void {
  if (process.env.DEBUG) {
    console.log(`${chalk.gray("[debug]")} ${chalk.gray(message)}`);
  }
}

export function step(n: number, total: number, message: string): void {
  console.log(`${chalk.cyan(`[${n}/${total}]`)} ${message}`);
}

export function header(title: string): void {
  console.log(`\n${chalk.bold.underline(title)}\n`);
}

export function dim(message: string): void {
  console.log(chalk.dim(message));
}
