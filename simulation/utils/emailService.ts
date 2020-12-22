import rp from 'request-promise';
import * as config from 'config';
import { ReportInterface } from './interfaces';

const dappMailerUrl = config.get('dappMailerUrl');
const givethDevMailList = config.get('givethDevMailList');

export const sendReportEmail = async (reportData: ReportInterface) => {
  try {
    if (!givethDevMailList) {
      return;
    }
    const tableStyle = 'width:100%; border: 1px solid black;  border-collapse: collapse;';
    const tableCellStyle = '  text-align: left;padding: 5px; border: 1px solid black;  border-collapse: collapse;';
    const promises = [];
    givethDevMailList.forEach(recipient => {
      const data = {
        recipient,
        template: 'notification',
        subject: 'Giveth - Report of running simulation script!',
        secretIntro: ``,
        title: 'See the simulation result',
        image: 'Giveth-milestone-review-approved-banner-email.png',
        text: `
              <table style='${tableStyle}'>
                <caption>Simulation Reports ${new Date()} </caption>
                <tr>
                  <th style='${tableCellStyle}'>syncDelegatesSpentTime</th>
                  <th style='${tableCellStyle}'>${reportData.syncDelegatesSpentTime}</th>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>syncProjectsSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncProjectsSpentTime}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>syncDonationsSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncDonationsSpentTime}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>createdDacs</td>
                  <td style='${tableCellStyle}'>${reportData.createdDacs}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>createdCampaigns</td>
                  <td style='${tableCellStyle}'>${reportData.createdCampaigns}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>createdMilestones</td>
                  <td style='${tableCellStyle}'>${reportData.createdMilestones}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>createdDonations</td>
                  <td style='${tableCellStyle}'>${reportData.createdDonations}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>correctFailedDonations</td>
                  <td style='${tableCellStyle}'>${reportData.correctFailedDonations}</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>createdPledgeAdmins</td>
                  <td style='${tableCellStyle}'>${reportData.createdPledgeAdmins}</td>
                </tr>
              </table>
      `,
        // cta: `Manage Milestone`,
        // ctaRelativeUrl: `/campaigns/${data.campaignId}/milestones/${data.milestoneId}`,
        unsubscribeType: 'simulation-report',
        unsubscribeReason: `You receive this email because you are in Giveth1-dev team`,
        // message: data.message,
      };
      promises.push(rp({
        method: 'POST',
        url: `${dappMailerUrl}/send`,
        headers: {
          Authorization: config.get('dappMailerSecret'),
        },
        form: data,
        json: true,
      }));
    });
    await Promise.all(promises);
  } catch (e) {
    console.log('sendReportEmail error', e);
  }

};
