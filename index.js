// @ts-check

import core from '@actions/core'
import { Octokit } from '@octokit/core'

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY || ''

;(async () => {
  try {
    const repoCount = parseInt(core.getInput('repoCount'))
    const repoPerRow = parseInt(core.getInput('reposPerRow'))
    const imageSize = parseInt(core.getInput('imageSize'))
    const ref = core.getInput('ref')

    const username = GITHUB_REPOSITORY.split('/')[0]
    const repo = GITHUB_REPOSITORY.split('/')[1]

    const { data: readmes } = await octokit.request(
      'GET /repos/{owner}/{repo}/contents/{path}',
      {
        owner: username,
        repo: repo,
        path: core.getInput('path'),
      },
    )

    const readme = Array.isArray(readmes) ? readmes[0] : readmes

    /** @type {boolean[]} */
    let recentReposHaveImage = []
    let recentRepos = new Set()

    /** GitHub Activity pagination is limited at 100 records x 3 pages */
    for (let i = 0; recentRepos.size < repoCount && i < 3; i++) {
      console.log(i)
      const { data: activity } = await octokit.request(
        `GET /users/{username}/events/public?per_page=100&page=${i}`,
        {
          username: username,
        },
      )
      console.log(activity)
      for (const value of activity) {
        console.log(value)
        let activityRepo = value.repo.name
        if (value.type === 'ForkEvent')
          activityRepo = value.payload.forkee.full_name
        if (
          !JSON.parse(core.getInput('excludeActivity')).includes(value.type) &&
          !JSON.parse(core.getInput('excludeRepo')).includes(activityRepo)
        ) {
          recentRepos.add(activityRepo)
        }
        if (recentRepos.size >= repoCount) break
      }
    }

    for (const repo of recentRepos) {
      await octokit
        .request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner: repo.split('/')[0],
          repo: repo.split('/')[1],
          path: 'DISPLAY.jpg',
        })
        .then(() => {
          recentReposHaveImage.push(true), recentReposHaveImage.push(false)
        })
    }

    const data = core
      .getInput('customReadmeFile')
      .replace(/\${\w{0,}}/g, (match) => {
        switch (match) {
          case '${repoTable}':
            return chunkArray(Array.from(recentRepos), repoPerRow)
              .map((value, row) => {
                return `|${value.map((value) => ` [${value}](https://github.com/${value}) |`)}
|${value.map(() => ` :-: |`)}
|${value.map(
                  (value, col) =>
                    ` <a href="https://github.com/${value}"><img src="https://github.com/${recentReposHaveImage[row * repoPerRow + col] ? value : `${username}/${repo}`}/raw/${ref}/DISPLAY.jpg" alt="${value}" title="${value}" width="${imageSize}" height="${imageSize}"></a> |`,
                )}\n\n`
              })
              .toString()
              .replace(/,/g, '')
          case '${header}':
            return core.getInput('header')
          case '${subhead}':
            return core.getInput('subhead')
          case '${footer}':
            return core.getInput('footer')
          default:
            console.error(`${match} is not recognised`)
            return ''
        }
      })

    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: username,
      repo: repo,
      path: core.getInput('path'),
      message: core.getInput('commit-message'),
      content: Buffer.from(data, 'utf8').toString('base64'),
      sha: readme.sha,
    })

    core.setOutput('repositories', Array.from(recentRepos))
  } catch (e) {
    console.error('Failed: ', e)
    core.setFailed('Failed: ' + /** @type {any} */ (e).message)
  }
})()

/**
 * @template T
 * @param {T[]} array
 * @param {number} size
 * @returns {T[][]}
 */
const chunkArray = (array, size) => {
  let chunked = []
  let index = 0
  while (index < array.length) {
    chunked.push(array.slice(index, size + index))
    index += size
  }
  return chunked
}
