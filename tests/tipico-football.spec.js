import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const datasets = {
  bl1: {
    groupId: 'virtual_footballBundesliga',
    referer: 'https://sports.tipico.de/de/alle/fussball/deutschland/bundesliga',
  },
  bl2: {
    groupId: 'virtual_footballBundesliga2',
    referer: 'https://sports.tipico.de/de/alle/fussball/deutschland/2-bundesliga',
  },
  bl3: {
    groupId: 'virtual_footballBundesliga3',
    referer: 'https://sports.tipico.de/de/alle/fussball/deutschland/3-liga',
  },
  'dfb-pokal': {
    groupId: 'virtual_footballDFBpokal',
    referer:
      'https://sports.tipico.de/de/alle/fussball/deutschland/dfb-pokal?mode=tc',
  },
}

const id = process.env.TEST_ID
const dataset = datasets[id]

test('test', async ({ request }) => {
  expect(dataset, `Unknown Tipico football id: ${id}`).toBeTruthy()

  const response = await request.get(
    `https://sports.tipico.de/v1/tpapi/programgateway/program/events/selectedEvents/all/${dataset.groupId}`,
    {
      headers: {
        accept: 'application/json',
        referer: dataset.referer,
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      },
      params: {
        competitionSort: 'TURNOVER',
        groupOutrightsByTeam: 'true',
        language: 'de',
        flattenNonOutrights: 'true',
      },
    }
  )

  expect(response.ok()).toBeTruthy()

  const data = await response.json()
  const outputFile = `./temp/tipico-football/${id}.json`
  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, JSON.stringify(data, null, 2))
})
