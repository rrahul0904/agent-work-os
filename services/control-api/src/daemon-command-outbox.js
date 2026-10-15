const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function insertDaemonCommand(queryable, machineId, command) {
  const commandId = command?.commandId;
  if (!UUID_PATTERN.test(commandId ?? "")) throw new Error("daemon_command_id_invalid");
  await queryable.query(
    `INSERT INTO agent_work_os_daemon_commands_v1 (command_id, machine_id, payload)
     VALUES ($1, $2, $3::jsonb) ON CONFLICT (command_id) DO NOTHING`,
    [commandId, machineId, JSON.stringify(command)]
  );
  return commandId;
}
