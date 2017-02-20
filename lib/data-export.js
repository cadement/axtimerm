/*

	exports

	event leaderboard

	event registration

	event results

	members

*/


var exporter = {};



// this converts the leaderboard data into either a CSV/TSV file or html report
exporter.exportEventLeaderboard = function(_cfg){
	var ev = _cfg.event || null
		, paxOrClass = _cfg.board || 'class'
		, exportType = _cfg.type || 'csv'
		, delimiter = _cfg.delimiter || ','
		, season = _cfg.season || null;


	if (!ev || !ev.classLeaderBoard || !ev.paxLeaderBoard)
		throw 'Invalid event object passed';

	if (['class','pax'].indexOf(paxOrClass) == -1)
		throw 'Invalid board, must be either "class" or "pax"';

	if (season === null)
		throw 'Invalid season model';

	var csv = []
		, items = []
		, row = []
		, totalEvents = ev.eventNumber
		, maxEvents = paxOrClass == 'class' ? season.classMaxEvents : season.paxMaxEvents;
	
	var classHeaders = ['driver','class','rank','total points','total with drops','prior rank','rank diff'];
	var paxHeaders = ['driver','rank','total points','total with drops','prior rank','rank diff'];

	var headers = classHeaders.slice(0);

	if (paxOrClass == 'pax'){
		items = ev.paxLeaderBoard.slice(0);
		headers = paxHeaders.slice(0);
	}
	else {
		items = ev.classLeaderBoard.slice(0);
	}

	for (var i = 1; i <= totalEvents; i++) {
		// classHeaders.push('event ' + i);
		// paxHeaders.push('event ' + i);
		headers.push('event ' + i);
	};


	if (exportType == 'csv') {
		csv.push(headers.join(delimiter));

		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			row = [];
			row.push(item.driver);
			//row.push(item.memberId);
			if (paxOrClass == 'class')
				row.push(item.axClass);
			row.push(item.rank);
			row.push(item.total);
			row.push(item.totalwDrops);
			row.push(item.priorRank);
			row.push(item.rankDiff);
			for (var a = 1; a <= totalEvents; a++) {
				row.push(item['event'+a] == -1 ? '' : item['event'+a]);
			};
			csv.push(row.join(delimiter));
		};

		return csv.join('\n') + '\n';
	}
	else if (exportType == 'html') {
		var cls = null
			, colspan = totalEvents + 5;

		var html = ['<html><head><title>Leaderboards</title><style>.leaderboard td {border-bottom:dashed 1px silver;} .leaderboard th {border-bottom: 1px solid #000;}</style></head><body>'];

		html.push('<div><span style="font-size:1.4em;font-weight:bold;">' + ev.season + ' ' + ev.club.name + (paxOrClass == 'class' ? ' Championship' : ' PAX Championship') + '</span></div>');
		html.push('<p>Max Events Counted: ' + maxEvents + '</p>');

		html.push('<table class="leaderboard" cellpadding="3" width="100%"><thead><tr>');

		// do headers
		
		if (paxOrClass == 'pax'){
			html.push('<th colspan="3"></th><th colspan="2">Points</th><th colspan="' + totalEvents + '">Events</th>');
		}
		else {
			html.push('<th colspan="3"></th><th colspan="2">Points</th><th colspan="' + totalEvents + '">Events</th>')
		}

		html.push('</tr><tr>');
		html.push('<th>Rank</th><th>Prev.</th><th>Driver</th><th>Total</th><th>w. Drops</th>');
		for (var i = 1; i <= totalEvents; i++) {
			html.push('<th>' + i + '</th>');
			
		};

		html.push('</tr></thead><tbody>');


		// do data
		
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			if (paxOrClass == 'class'){
				if (item.axClass != cls){
					html.push('<tr><td style="background-color:#e8e8e8;" colspan="' + colspan + '"><strong>' + item.axClass + '</strong></td></tr>');
					cls = item.axClass;
				}
			}

			html.push('<tr>');
			html.push('<td>' + item.rank + '</td>');
			html.push('<td>' + item.priorRank + '</td>');
			html.push('<td>' + item.driver + '</td>');
			html.push('<td>' + item.total + '</td>');
			html.push('<td>' + item.totalwDrops + '</td>');
			for (var a = 1; a <= totalEvents; a++) {
				html.push('<td>' + (item['event'+a] == -1 ? '-' : item['event'+a]) + '</td>');
			};
			html.push('</tr>');
		};

		html.push('</tbody></table>');
		html.push('<p> Generated: ' + new Date() + '</p>');


		html.push('</body></html>');
		return html.join('');
	}
	else {
		throw 'Invalid export type.';
	}
		

}

module.exports = exporter;