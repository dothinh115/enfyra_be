import { Column, Entity, OneToMany, PrimaryGeneratedColumn, ManyToMany, ManyToOne, OneToOne, JoinTable, JoinColumn, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role } from './role.entity';

import { User } from './user.entity';

@Entity()
export class Setting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({type:'boolean', nullable: false, default: false})
  isInit: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  UpdatedAt: Date;
}