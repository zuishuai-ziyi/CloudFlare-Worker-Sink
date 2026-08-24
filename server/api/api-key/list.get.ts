defineRouteMeta({
  openAPI: {
    description: 'List all API keys (admin only)',
    security: [{ bearerAuth: [] }],
  },
})

export default eventHandler(async (event) => {
  const keys = await listApiKeyRecords(event)
  return { keys }
})
