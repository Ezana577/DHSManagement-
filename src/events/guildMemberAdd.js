import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from 'discord.js';

const WELCOME_CHANNEL_ID = '1400529715428851803';

export const name = 'guildMemberAdd';
export const once = false;

export async function execute(member) {
  console.log('[WELCOME] guildMemberAdd fired for:', member.user.tag);

  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) {
    console.log('[WELCOME] Channel not found:', WELCOME_CHANNEL_ID);
    return;
  }

  const memberCount = member.guild.memberCount;

  const container = new ContainerBuilder()
    .setAccentColor(0x1d72d7)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('https://i.imgur.com/3uRwl64.png')
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Welcome to DHS`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Welcome ${member} to the **Department of Homeland Security**.\nYou are member **#${memberCount}**.`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Getting Started**\n` +
        `› Verify yourself → <#1400529806738722978>\n` +
        `› Read the rules → <#1400506097168547890>\n` +
        `› Pick your roles → <#1401243246872760371>\n` +
        `› Apply for DHS → <#1400523421200154820>`
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# DHS System • Onboarding`)
    );

  await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [member.id] },
  });
}
