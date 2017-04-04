#!/usr/bin/env node

'use strict';

const program = require('commander');
const initTBA = require('thebluealliance');
const async = require('async');
const fs = require('fs');
const ChartjsNode = require('chartjs-node');

const tba = new initTBA('frc-auto-rankings', 'auto rankings', '1.0.0');

let statName = '';

let gatherData = (options, callback) => {
	async.waterfall([
		(callback) => {
			tba.getEventList(options.year, (err, events) => {
				callback(undefined, events);
			});
		},
		(events, callback) => {
			let rankings = [];

			if (!options.data) {
				let stats = [];

				async.each(events, (event, cb) => {
					tba.getEventRankings(event.event_code, event.year, (err, eventRankings) => {
						if (eventRankings && eventRankings[0]) {
							stats = eventRankings[0];
							statName = eventRankings[0][options.stat];

							eventRankings.shift();
							rankings = rankings.concat(eventRankings);
						}

						cb();
					});
				}, () => {
					fs.writeFileSync('./data.rd', JSON.stringify({stats, rankings}));

					callback(undefined, rankings);
				});
			} else {
				const data = JSON.parse(fs.readFileSync(options.data));
				statName = data.stats[options.stat];

				callback(undefined, data.rankings)
			}
		},
		(rankings, callback) => {
			let teams = {};
			let teamsMatches = {};

			async.each(rankings, (rank, cb) => {
				if (teams[rank[1]]) {
					teamsMatches[rank[1]]++;
					teams[rank[1]] = (teams[rank[1]] + (rank[options.stat] / rank[9])) / teamsMatches[rank[1]];
				} else {
					teamsMatches[rank[1]] = 1;
					teams[rank[1]] = rank[options.stat] / rank[9];
				}

				cb();
			}, () => {
				callback(undefined, teams);
			});
		}
	], (err, result) => {
		callback(result, statName)
	});
};

let plotData = (teams, max, median, count, labels) => {
	const chartNode = new ChartjsNode(1200, 600);

	const chartJsOptions = {
		type: 'line',
		data: {
			labels: labels,
			datasets: [
				{
					label: '# of Teams',
					data: count,
					backgroundColor: 'rgba(255, 48, 76, 0.5)',
					borderWidth: 1
				}
			],
			backgroundColor: 'rgba(255, 255, 255, 1)'
		},
		options: {
			plugins: {
				afterDraw: (chart) => {
					const ctx = chart.chart.ctx;
					const chartArea = chart.chartArea;

					teams.forEach((team) => {
						// Draw our position
						ctx.beginPath();
						ctx.strokeStyle = '#000000';
						ctx.moveTo((team[1] / max) * 100 * ((chartArea.right - chartArea.left) / 100) + chartArea.left, 0);
						ctx.lineTo((team[1] / max) * 100 * ((chartArea.right - chartArea.left) / 100) + chartArea.left, 600);
						ctx.stroke();

						// Draw team info
						ctx.fillStyle = '#000000';
						ctx.textAlign = 'center';
						ctx.fillText(team[0], (team[1] / max) * 100 * ((chartArea.right - chartArea.left) / 100) + chartArea.left + team[0].length * 4, Math.floor((Math.random() * 600) + 1));
					});

					// Draw median
					ctx.beginPath();
					ctx.strokeStyle = '#0000ff';
					ctx.moveTo((median / max) * 100 * ((chartArea.right - chartArea.left) / 100) + chartArea.left, 0);
					ctx.lineTo((median / max) * 100 * ((chartArea.right - chartArea.left) / 100) + chartArea.left, 600);
					ctx.stroke();
				},
				beforeDraw: (chart) => {
					const ctx = chart.chart.ctx;
					const chartArea = chart.chartArea;

					// Draw white background
					ctx.save();
					ctx.fillStyle = '#ffffff';
					ctx.fillRect(0, 0, 1200, 600);
					ctx.restore();

					const dataset = chart.config.data.datasets[0];

					for (let i = 0; i < dataset._meta[0].data.length; i++) {
						let model = dataset._meta[0].data[i]._model;

						let offset = ((max / 40) * ((chartArea.right - chartArea.left) / max) + chartArea.left)/2;

						model.x += offset;

						model.controlPointNextX += offset;
						model.controlPointPreviousX += offset;
					}
				}
			}
		}
	};

	chartNode.drawChart(chartJsOptions).then((streamResult) => {
		return chartNode.writeImageToFile('image/png', `./images/${statName}-${new Date().getTime()}.png`);
	});
}

let findMedian = (values) => {
    values.sort((a,b) => { return a - b; });

    let half = Math.floor(values.length / 2);

    if (values.length % 2) return values[half];
    else return (values[half - 1] + values[half]) / 2.0;
}

let rankFunction = (options) => {
	options.teams = options.teams.split(',');

	gatherData(options, (result, statName) => {
		let sortable = [];
		let values = [];

		for (let team in result) {
			values.push(result[team]);
			sortable.push([team, result[team]]);
		}

		sortable.sort((a, b) => {
			return b[1] - a[1];
		});

		let points = [];
		for (let i = 0; i < sortable.length; i++) {
			if (options.teams.indexOf(sortable[i][0].toString()) > -1) {
				points.push(sortable[i]);
				console.log('------------------------------------');
				console.log(`| Team: ${sortable[i][0]}\n` +
							`| Avg ${statName}: ${sortable[i][1]}\n` +
							`| Ranking: ${i + 1}/${sortable.length}\n` +
							`| Top %: ${(i + 1) / sortable.length}`);
			}
		}

		console.log('------------------------------------');

		let max = sortable[0][1];
		let count = [];
		let labels = [];

		let datapoints = 20;

		for (var i = 0; i < datapoints + 1; i++) {
			labels[i] = Math.round((max * (1 / datapoints) * i) * 100) / 100;
		}

		for (var i = 0; i < sortable.length; i++) {
			for (var n = 0; n < datapoints; n++) {
				if (sortable[i][1] >= max * ((1 / datapoints) * n) && sortable[i][1] < max * ((1 / datapoints) * (n + 1))) {
					if (count[n]) count[n]++;
					else count[n] = 1;
				}
			}
		}

		for (var i = 0; i < datapoints; i++) {
			if (!count[i]) count[i] = 0;
		}

		plotData(points, max, findMedian(values), count, labels);
	});
};

program.version('1.0.0')
	.command('rank')
	.option('-y, --year <required>', 'the year from which to gather statstics')
	.option('-t, --teams <required>', 'the team(s) to get gather statistics for')
	.option('-s, --stat <required>', 'the stat to gather')
	.option('-d, --data [optional]', 'the file name of a data file')
	.action(rankFunction);

program.parse(process.argv);

if (program.args.length === 0) program.help();
