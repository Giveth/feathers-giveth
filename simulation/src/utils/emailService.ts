import axios from 'axios';
import { ReportInterface } from './interfaces';


export const sendReportEmail = async (reportData: ReportInterface,
                                      givethDevMailList:string[],
                                      dappMailerUrl :string,
                                      dappMailerSecret: string
                                      ) => {
  try {
    const tableStyle = 'width:100%; border: 1px solid black;  border-collapse: collapse;';
    const tableCellStyle = '  text-align: left;padding: 5px; border: 1px solid black;  border-collapse: collapse;';
    const promises = [];

    /**
     * You can see the dapp-mail code here @see{@link https://github.com/Giveth/dapp-mailer/blob/master/src/services/send/send.hooks.js}
     */
    const data = {
      template: 'notification',
      subject: `Simulation report ${new Date()}` ,
      secretIntro: `This is required but I dont know what is this field`,
      title: 'See the simulation result',
      image: 'Giveth-review-banner-email.png',
      text: `
              <table style='${tableStyle}'>
                <tr>
                  <td style='${tableCellStyle}'>syncDelegatesSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncDelegatesSpentTime} seconds</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>syncProjectsSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncProjectsSpentTime} seconds</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>syncDonationsSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncDonationsSpentTime} seconds</td>
                </tr>
                <tr>
                  <td style='${tableCellStyle}'>syncPledgeAdminsSpentTime</td>
                  <td style='${tableCellStyle}'>${reportData.syncPledgeAdminsSpentTime} seconds</td>
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
    givethDevMailList.forEach(recipient => {
      promises.push(
        axios.post(`${dappMailerUrl}/send`,{
          ...data, recipient
        },
          {
            headers:{
              Authorization:dappMailerSecret
            }
          }
          )
      )
    });
    await Promise.all(promises);
  } catch (e) {
    console.log('sendReportEmail error', e);
  }

};

export const sendSimulationErrorEmail = async (error: string,
                                      givethDevMailList:string[],
                                      dappMailerUrl :string,
                                      dappMailerSecret: string
                                      ) => {
  try {
    const promises = [];

    /**
     * You can see the dapp-mail code here @see{@link https://github.com/Giveth/dapp-mailer/blob/master/src/services/send/send.hooks.js}
     */
    const data = {
      template: 'notification',
      subject: `Simulation report ${new Date()}` ,
      secretIntro: `This is required but I dont know what is this field`,
      title: 'Simulation failed :((',
      image: 'Giveth-milestone-review-rejected-banner-email.png',
      text: error,
      unsubscribeType: 'simulation-report',
      unsubscribeReason: `You receive this email because you are in Giveth1-dev team`,
    };
    givethDevMailList.forEach(recipient => {
      promises.push(
        axios.post(`${dappMailerUrl}/send`,{
          ...data, recipient
        },
          {
            headers:{
              Authorization:dappMailerSecret
            }
          }
          )
      )
    });
    await Promise.all(promises);
  } catch (e) {
    console.log('sendSimulationErrorEmail error', e);
  }

};
